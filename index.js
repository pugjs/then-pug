'use strict';

var fs = require('fs');
// we have to use regenerator until UglifyJS has generator support
var regenerator = require('regenerator');
var ReadableStream = require('barrage').Readable;
var Promise = require('promise');
var ty = require('then-yield');
var addWith = require('with');
var runtime = require('jade/lib/runtime');
var Parser = require('jade/lib/parser');
var Compiler = require('./lib/compiler');

var wrapGenerator = (function () {
  var vm = require('vm');
  var ctx = vm.createContext({});
  var file = require.resolve('regenerator/runtime/dev.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, file);
  return ctx.wrapGenerator;
}());

function parse(str, options) {
  var filename = options.filename ? JSON.stringify(options.filename) : 'undefined';
  try {
    // Parse
    var parser = new (options.parser || Parser)(str, options.filename, options);

    // Compile
    var compiler = new (options.compiler || Compiler)(parser.parse(), options);

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
    globals.push('wrapGenerator');
    globals.push('buf');

    return ''
      + 'var jade_mixins = {};\n'
      + 'var jade_interp;\n'
      + addWith('locals || {}', '\n' + regenerator('function* template() {\n' + js + '\n}\nreturn template;\n'), globals) + ';';
  } catch (err) {
    parser = parser.context();
    runtime.rethrow(err, parser.filename, parser.lexer.lineno, parser.input);
  }
};

exports.compile = compile;
function compile(str, options, callback) {
  var fn = compileStreaming(str, options);
  return function (locals, callback) {
    return fn(locals).buffer('utf8', callback);
  }
}

exports.compileStreaming = compileStreaming;
function compileStreaming(str, options) {
  var options = options || {};
  var fn = parse(str, options);

  // get a generator function that takes `(locals, jade, buf)`
  fn = new Function('wrapGenerator', 'return function (locals, jade, buf) {' + fn + '}')(wrapGenerator);
  
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

exports.render = render;
function render(str, options, callback) {
  return Promise.from(null).then(function () {
    return compile(str, options)(options, callback);
  });
}

exports.renderStreaming = renderStreaming;
function renderStreaming(str, options) {
  return compileStreaming(str, options)(options);
}


/**
 * Template function cache.
 */

exports.cache = {};

exports.renderFile = renderFile;
function renderFile(path, options, callback) {
  return Promise.from(null).then(function () {
    return renderFileStreaming(path, options).buffer('utf8', callback);
  });
}

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