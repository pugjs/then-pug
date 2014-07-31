'use strict';

/**
 * Module dependencies.
 */

var fs = require('fs');
var ReadableStream = require('barrage').Readable;
var Promise = require('promise');
var ty = require('then-yield');
var addWith = require('with');
var runtime = require('jade/lib/runtime');
var Parser = require('jade/lib/parser');
var Compiler = require('./lib/compiler');

/**
 * Choose Generators handler
 * ES6 code may be an issue for legacy systems (old browsers, node < 0.11)
 * Several solutions are which have their respective trade-offs
 *  - regenerator:
 *      modifies ES6 code to ES5 code. handles many legacy systems but slow
 *  - hack:
 *      search&replace hacks on the code to make it compatible with the UglifyJS module used by addWith
 *      fast but only compatible with systems understanding ES6 generators
 *
 * Note: 2014-08-01 UglifyJS does not yet support ES6 generators ; remove hack when it does
 */
var supportsGenerators = true;
var generator_handler = "hack";
var regenerator, wrapGenerator;
try {
  Function('', 'var gn=function*() {}');
} catch (ex) {
  console.log(ex);
  supportsGenerators = false;
  generator_handler = "regenerator";
  regenerator = require('regenerator');
}

/**
 * Prepare the `regenerator` runtime.
 * `regenerator` transforms a function definition by removing all occurences
 * of the --harmony generator syntax (`function*`, `yield`) and replacing
 * them by calls to the wrapGenerator runtime
 */
if (generator_handler === "regenerator") {
  wrapGenerator = (function () {
    var vm = require('vm');
    var ctx = vm.createContext({});
    var file = require.resolve('regenerator/runtime/dev.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, file);
    return ctx.wrapGenerator;
  }());
}

/**
 * Parse the given `str` of jade and return a function body.
 *
 * Original jade parser cannot be used because UglifyJS breaks
 * when given a function definition using the --harmony generator syntax
 *
 * @param {String} str
 * @param {Object} options
 * @return {String}
 * @api private
 */
function parse(str, options) {
  var filename = options.filename ? JSON.stringify(options.filename) : 'undefined';
  try {
    // Parse
    var parser = new (options.parser || Parser)(str, options.filename, options);

    // Compile
    var compiler = new (options.compiler || Compiler)(parser.parse(), options);

    // Force the compilation of all mixins even if they are not used
    // This is necessary for just-in-time mixin compilation
    compiler.dynamicMixins = true;

    var js = compiler.compile();

    // Debug compiler
    if (options.debug) {
      console.error('\nCompiled Function:\n\n\u001b[90m%s\u001b[0m', js.replace(/^/gm, '  '));
    }

    if (options.compileDebug !== false) {
      js = [
          'var jade_debug = [{ lineno: 1, filename: ' + filename + ' }];'
        , 'try {'
        , js
        , '} catch (err) {'
        , '  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno'
          + (options.compileDebug === true ? ',' + JSON.stringify(str) : '') + ');'
        , '}'
      ].join('\n');
    }

    var globals = options.globals && Array.isArray(options.globals) ? options.globals : [];

    globals.push('jade');
    globals.push('jade_mixins');
    globals.push('jade_interp');
    globals.push('jade_debug');
    if (generator_handler === "regenerator") {
      globals.push('wrapGenerator');
    }
    globals.push('buf');

    var js_es5, js_wrapped, js_with;
    switch(generator_handler) {
      case 'regenerator':
        js_wrapped = 'function* template() {\n' + js + '\n}\nreturn template;\n';
        js_es5 = regenerator(js_wrapped);
        js_with = addWith('locals || {}', '\n' + js_es5, globals);
        break;
      case 'hack':
        js_es5 = js.replace(/function\*/g, 'function');
        js_es5 = js_es5.replace(/yield\*?/g, '');
        js_with = addWith('locals || {}', '\n' + 'function template() {\n' + js_es5 + '\n}\nreturn template;\n', globals)
                    .replace(js_es5, js)
                    .replace('function template', 'function* template');
        break;
    }

    // note: we allow injection/extraction of mixins via a jade_mixins locals
    return ''
      + 'var jade_mixins = locals.jade_mixins || {};\n'
      + 'var jade_interp;\n'
      + js_with + ';';

  } catch (err) {
    parser = parser.context();
    runtime.rethrow(err, parser.filename, parser.lexer.lineno, parser.input);
  }
};

/**
 * Compile an asynchronous `Function` representation of the given jade `str`.
 *
 * The resulting function takes 2 arguments :
 *  - `locals` object containing local variables or promises that can be used in the template
 *  - `callback` is a regular node-style callback function(err, res). it will be called asynchronously when
 *    the rendering finishes
 *
 * For Options, see `compileStreaming` documentation
 *
 * @param {String} str
 * @param {Options} options
 * @return {Function}
 * @api public
 */
exports.compile = compile;
function compile(str, options) {
  var fn = compileStreaming(str, options);
  return function (locals, callback) {
    return fn(locals).buffer('utf8', callback);
  }
}

/**
 * Compile a `Function` representation of the given jade `str`.
 *
 * This `Function` takes 1 argument:
 *  - `locals` object containing local variables or promises that can be used in the template
 * and returns a Readable stream, which is an async rendering of the template `str` for the given `locals`
 *
 * Options:
 *  - `compileDebug` when `false` debugging code is stripped from the compiled
 *    template, when it is explicitly `true`, the source code is included in
 *    the compiled template for better accuracy.
 *  - `filename` used to improve errors when `compileDebug` is not `false` and to resolve imports/extends
 *
 * @param {String} str
 * @param {Options} options
 * @return {Function}
 * @api public
 */
exports.compileStreaming = compileStreaming;
function compileStreaming(str, options) {
  var options = options || {};
  var fn = parse(str, options);

  // get a generator function that takes `(locals, jade, buf)`
  switch(generator_handler) {
    case 'regenerator':
      fn = new Function('wrapGenerator', 'return function (locals, jade, buf) {' + fn + '}')(wrapGenerator);
      break;
    case 'hack':
      fn = new Function ('return function (locals, jade, buf) {' + fn + '}')();
      break;
  }

  // convert it to a function that takes `locals` and returns a readable stream
  return function (locals) {
    var stream = new ReadableStream();
    
    // streaming will be set to false whenever there is back-pressure
    var streaming = false;

    function release() {
      streaming = true;
    }

    // make sure _read is always implemented
    stream._read = release;

    // then-yield unwrap function
    // which implements the backpressure pause mechanism
    function unwrap(value) {
      if (streaming) return value;
      return new Promise(function (resolve) {
        stream._read = function () {
          release();
          this._read = release;
          resolve(value);
        }
      });
    }

    var template = fn(locals, runtime, {
      push: function () {
        for (var i = 0; i < arguments.length; i++)
          if (!stream.push(arguments[i].toString())) streaming = false;
      }
    });

    // call our function, setting `streaming` to `false` whenever
    // the buffer is full and there is back-pressure
    var result = ty.spawn(template, Promise.cast, unwrap);

    // once the function completes, we end the stream by pushing `null`
    if (result)
      result.then(stream.push.bind(stream, null), function (err) {
        stream.emit('error', err);
        stream.push(null);
      });
    else
      stream.push(null);

    return stream;
  };
}

/**
 * Render the given `str` of jade.
 *
 * If the function is called with an optional node-style `callback`, the callback
 * will be called with the result when the rendering is finished.
 *
 * Otherwise, the function will return a Promise that will be fulfilled when
 * the rendering is finished.
 * 
 * Options:
 *   - `filename` filename required for `include` / `extends`
 *
 * @param {String} str
 * @param {Object} options
 * @param {Function|undefined} callback
 * @return {undefined|Promise}
 * @api public
 */
exports.render = render;
function render(str, options, callback) {
  return Promise.from(null).then(function () {
    var fn = compileStreaming(str, options);
    return fn(options).buffer('utf8');
  }).nodeify(callback);
}

/**
 * Render the given `str` of jade
 * 
 * `options`:
 *   - `filename` filename required for `include` / `extends`
 *
 * `options` are used as `locals` at rendering time.
 *
 * The result is a ReadableStream wrapping the asynchronous rendering of the template.
 * This stream can be piped into a WritableStream.
 *
 *
 * @param {String} str
 * @param {Object} options
 * @return {ReadableStream}
 * @api public
 */
exports.renderStreaming = renderStreaming;
function renderStreaming(str, options) {
  return compileStreaming(str, options)(options);
}


/**
 * Template function cache.
 */

exports.cache = {};

/**
 * Render the given `path` file containing a jade.
 * The compilation of the file is synchronous and uses an internal in-memory cache
 * to avoid re-compiling the same file twice.
 * The rendering is asynchronous.
 *
 * If the function is called with an optional node-style `callback`, the callback
 * will be called with the result when the rendering is finished.
 *
 * Otherwise, the function will return a Promise that will be fulfilled when
 * the rendering is finished.
 *
 * `options` are used as `locals` at rendering time.
 *
 * @param {String} path
 * @param {Object} options
 * @param {Function|undefined} callback
 * @return {undefined|Promise}
 * @api public
 */
exports.renderFile = renderFile;
function renderFile(path, options, callback) {
  return Promise.from(null).then(function () {
    return renderFileStreaming(path, options).buffer('utf8');
  }).nodeify(callback);
}

/**
 * Render the given `path` file containing a jade.
 * The compilation of the file is synchronous and uses an internal in-memory cache
 * to avoid re-compiling the same file twice.
 * The rendering is asynchronous.
 *
 * The result is a ReadableStream wrapping the asynchronous rendering of the template.
 * This stream can be piped into a WritableStream.
 *
 * `options` are used as `locals` at rendering time.
 *
 * Options:
 *  - `cache`: true/false to activate the cache mechanism
 *
 * @param {String} path
 * @param {Object|undefined} options
 * @return {ReadableStream}
 * @api public
 */
exports.renderFileStreaming = renderFileStreaming;
function renderFileStreaming(path, options) {
  options = options || {};
  options.filename = path;
  var fn;
  if (options.cache) {
    fn = exports.cache['key:' + path];
  }
  if (!fn) {
    fn = compileStreaming(fs.readFileSync(path, 'utf8'), options);
  }
  if (options.cache) {
    exports.cache['key:' + path] = fn;
  }
  return fn(options);
}
