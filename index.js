/*!
 * Jade
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var all = require('then-all');
var isPromise = require('is-promise');
var Promise = require('promise');
function when(value) {
  if (isPromise(value)) {
    return value;
  } else {
    return new Promise(function (resolver) { resolver.fulfill(value) });
  }
}
function nodeify(promise, cb) {
  if (typeof cb === 'function') {
    promise.then(function (res) {
      setTimeout(function () { cb(null, res); }, 0);//don't swallow exceptions
    }, function (err) {
      setTimeout(function () { cb(err); }, 0);//don't swallow exceptions
    });
  } else {
    return promise;
  }
}

var fs = require('fs');
var jade = require('jade');
var Parser = require('./parser');
var runtime = jade.runtime;
var Compiler = require('./compiler');
var renderFilter = Compiler.render;

Object.keys(jade)
  .forEach(function (name) {
    if (name === '__express' || name === 'filters') return;
    exports[name] = jade[name];
  });
exports.Compiler = Compiler;



/**
 * Parse the given `str` of jade and return a function body.
 *
 * @param {String} str
 * @param {Object} options
 * @return {String}
 * @api private
 */

function parse(str, options){
  try {
    // Parse
    var parser = new Parser(str, options.filename, options);

    // Compile
    var compiler = new (options.compiler || Compiler)(parser.parse(), options)
      , js = compiler.compile();

    return js.then(function (js) {
      // Debug compiler
      if (options.debug) {
        console.error('\nCompiled Function:\n\n\033[90m%s\033[0m', js.replace(/^/gm, '  '));
      }

      return ''
        + 'var buf = [];\n'
        + (options.self
          ? 'var self = locals || {};\n' + js
          : 'with (locals || {}) {\n' + js + '\n}\n')
        + 'return all(buf).then(function (buf) { return buf.join(""); });';
    });
  } catch (err) {
    parser = parser.context();
    runtime.rethrow(err, parser.filename, parser.lexer.lineno);
  }
}

/**
 * Strip any UTF-8 BOM off of the start of `str`, if it exists.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function stripBOM(str){
  return 0xFEFF == str.charCodeAt(0)
    ? str.substring(1)
    : str;
}

/**
 * Compile a `Function` representation of the given jade `str`.
 *
 * Options:
 *
 *   - `compileDebug` when `false` debugging code is stripped from the compiled template
 *   - `client` when `true` the helper functions `escape()` etc will reference `jade.escape()`
 *      for use with the Jade client-side runtime.js
 *
 * @param {String} str
 * @param {Options} options
 * @return {Function}
 * @api public
 */
jade.compile = exports.compile = function(str, options){
  var options = options || {}
    , client = options.client
    , filename = options.filename
      ? JSON.stringify(options.filename)
      : 'undefined'
    , fn;

  str = stripBOM(String(str));

  fn = parse(str, options)
    .then(function (body) {
      if (options.compileDebug !== false) {
        return [
            'var __jade = [{ lineno: 1, filename: ' + filename + ' }];'
          , 'try {'
          , body
          , '} catch (err) {'
          , '  rethrow(err, __jade[0].filename, __jade[0].lineno);'
          , '}'
        ].join('\n');
      } else {
        return body;
      }
    });

  fn = fn.then(function (src) {
    fn = new Function('locals, attrs, escape, rethrow, merge, when, all, render', src);
    return fn;
  })

  return function (locals) {
    if (isPromise(fn)) {
      return fn.then(function (fn) {
        return fn(locals, runtime.attrs, runtime.escape, runtime.rethrow, runtime.merge, when, all, renderFilter);
      })
    } else {
      return fn(locals, runtime.attrs, runtime.escape, runtime.rethrow, runtime.merge, when, all, renderFilter);
    }
  };
};

var promise = new Promise(function (resolver) { resolver.fulfill(null); });

/**
 * Render the given `str` of jade and invoke
 * the callback `fn(err, str)`.
 *
 * Options:
 *
 *   - `cache` enable template caching
 *   - `filename` filename required for `include` / `extends` and caching
 *
 * @param {String} str
 * @param {Object|Function} options or fn
 * @param {Function} fn
 * @api public
 */
exports.render = function(str, options, fn){
  // swap args
  if ('function' == typeof options) {
    fn = options, options = {};
  }
  return nodeify(promise.then(function () {

    // cache requires .filename
    if (options.cache && !options.filename) {
      throw new Error('the "filename" option is required for caching');
    }

    var path = options.filename;
    var tmpl = options.cache
      ? exports.cache[path] || (exports.cache[path] = exports.compile(str, options))
      : exports.compile(str, options);
    return tmpl(options);
  }), fn);
};

/**
 * Render a Jade file at the given `path` and callback `fn(err, str)`.
 *
 * @param {String} path
 * @param {Object|Function} options or callback
 * @param {Function} fn
 * @api public
 */

exports.renderFile = function (path, options, fn) {
  if ('function' == typeof options) {
    fn = options, options = {};
  }
  return nodeify(promise.then(function () {
    var key = path + ':string';

    options.filename = path;
    var str = options.cache
      ? exports.cache[key] || (exports.cache[key] = fs.readFileSync(path, 'utf8'))
      : fs.readFileSync(path, 'utf8');
    return exports.render(str, options);
  }), fn);
};