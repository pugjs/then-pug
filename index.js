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


var consolidate = {};
var consolidateB = require('consolidate-build');
Object.keys(consolidateB).forEach(function (key) {
  if (typeof consolidateB[key] != 'function') {
    consolidate[key] = consolidateB[key];
  } else {
    consolidate[key] = function () {
      var args = Array.prototype.slice.call(arguments);
      return new Promise(function (resolver) {
        try {
          args.push(function (err, res) {
            if (err) resolver.reject(err);
            else resolver.fulfill(res);
          });
          consolidateB[key].apply(consolidateB, args);
        } catch (ex) {
          resolver.reject(ex);
        }
      });
    };
    consolidate[key].render = function () {
      var args = Array.prototype.slice.call(arguments);
      return new Promise(function (resolver) {
        try {
          args.push(function (err, res) {
            if (err) resolver.reject(err);
            else resolver.fulfill(res);
          });
          consolidateB[key].render.apply(consolidateB[key], args);
        } catch (ex) {
          resolver.reject(ex);
        }
      });
    };
    consolidate[key].outExtension = consolidateB[key].outExtension;
    consolidate[key].inExtension = consolidateB[key].inExtension;
  }
});

var jade = require('jade');
var Parser = jade.Parser;
var runtime = jade.runtime;
var Compiler = require('./compiler');


Object.keys(jade)
  .forEach(function (name) {
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
    fn = new Function('locals, attrs, escape, rethrow, merge, when, all, consolidate', src);
    return fn;
  })

  return function(locals){
    if (isPromise(fn)) {
      return fn.then(function (fn) {
        return fn(locals, runtime.attrs, runtime.escape, runtime.rethrow, runtime.merge, when, all, consolidate);
      })
    } else {
      return fn(locals, runtime.attrs, runtime.escape, runtime.rethrow, runtime.merge, when, all, consolidate);
    }
  };
};