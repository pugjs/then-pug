
/**
 * Module dependencies.
 */

var assert = require('assert');
var fs = require('fs');
var ty = require('then-yield');
var jade = require('../');

// Shortcut

function getError(str, options){
  return jade.render(str, options).then(function () {
    throw new Error('Input was supposed to result in an error.');
  }, function (err) {
    return err;
  });
}
function getFileError(name, options){
  return jade.renderFile(name, options).then(function () {
    throw new Error('Input was supposed to result in an error.');
  }, function (err) {
    return err;
  });
}


describe('error reporting', function () {
  describe('compile time errors', function () {
    describe('with no filename', function () {
      async('includes detail of where the error was thrown', function* () {
        var err = yield getError('foo(')
        assert(/Jade:1/.test(err.message))
        assert(/foo\(/.test(err.message))
      });
    });
    describe('with a filename', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getError('foo(', {filename: 'test.jade'})
        assert(/test\.jade:1/.test(err.message))
        assert(/foo\(/.test(err.message))
      });
    });
    describe('with a layout without block declaration (syntax)', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getFileError(__dirname + '/fixtures/compile.with.layout.syntax.error.jade', {})
        assert(/[\\\/]layout.syntax.error.jade:2/.test(err.message))
        assert(/foo\(/.test(err.message))
      });
    });
    describe('with a layout without block declaration (locals)', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getFileError(__dirname + '/fixtures/compile.with.layout.locals.error.jade', {})
        assert(/[\\\/]layout.locals.error.jade:2/.test(err.message))
        assert(/undefined is not a function/.test(err.message))
      });
    });
    describe('with a include (syntax)', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getFileError(__dirname + '/fixtures/compile.with.include.syntax.error.jade', {})
        assert(/[\\\/]include.syntax.error.jade:2/.test(err.message))
        assert(/foo\(/.test(err.message))
      });
    });
    describe('with a include (locals)', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getFileError(__dirname + '/fixtures/compile.with.include.locals.error.jade', {})
        assert(/[\\\/]include.locals.error.jade:2/.test(err.message))
        assert(/foo\(/.test(err.message))
      });
    });
    describe('with a layout (without block) with an include (syntax)', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getFileError(__dirname + '/fixtures/compile.with.layout.with.include.syntax.error.jade', {})
        assert(/[\\\/]include.syntax.error.jade:2/.test(err.message))
        assert(/foo\(/.test(err.message))
      });
    });
    describe('with a layout (without block) with an include (locals)', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getFileError(__dirname + '/fixtures/compile.with.layout.with.include.locals.error.jade', {})
        assert(/[\\\/]include.locals.error.jade:2/.test(err.message))
        assert(/foo\(/.test(err.message))
      });
    });
  });
  describe('runtime errors', function () {
    describe('with no filename and `compileDebug` left undefined', function () {
      async('just reports the line number', function* () {
        var sentinel = new Error('sentinel');
        var err = yield getError('-foo()', {foo: function () { throw sentinel; }})
        assert(/on line 1/.test(err.message))
      });
    });
    describe('with no filename and `compileDebug` set to `true`', function () {
      async('includes detail of where the error was thrown', function* () {
        var sentinel = new Error('sentinel');
        var err = yield getError('-foo()', {foo: function () { throw sentinel; }, compileDebug: true})
        assert(/Jade:1/.test(err.message))
        assert(/-foo\(\)/.test(err.message))
      });
    });
    describe('with a filename that does not correspond to a real file and `compileDebug` left undefined', function () {
      async('just reports the line number', function* () {
        var sentinel = new Error('sentinel');
        var err = yield getError('-foo()', {foo: function () { throw sentinel; }, filename: 'fake.jade'})
        assert(/on line 1/.test(err.message))
      });
    });
    describe('with a filename that corresponds to a real file and `compileDebug` left undefined', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var sentinel = new Error('sentinel');
        var path = __dirname + '/fixtures/runtime.error.jade'
        var err = yield getError(fs.readFileSync(path, 'utf8'), {foo: function () { throw sentinel; }, filename: path})
        assert(/fixtures[\\\/]runtime\.error\.jade:1/.test(err.message))
        assert(/-foo\(\)/.test(err.message))
      });
    });
    describe('in a mixin', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getFileError(__dirname + '/fixtures/runtime.with.mixin.error.jade', {})
        assert(/mixin.error.jade:2/.test(err.message))
        assert(/Cannot read property 'length' of null/.test(err.message))
      });
    });
    describe('in a layout', function () {
      async('includes detail of where the error was thrown including the filename', function* () {
        var err = yield getFileError(__dirname + '/fixtures/runtime.layout.error.jade', {})
        assert(/layout.with.runtime.error.jade:3/.test(err.message))
        assert(/Cannot read property 'length' of undefined/.test(err.message))
      });
    });
  });
  describe('deprecated features', function () {
    async('deprecates `!!!` in favour of `doctype`', function* () {
      var err = yield getError('!!! 5', {filename: 'test.jade'})
      assert(/test\.jade:1/.test(err.message))
      assert(/`!!!` is deprecated, you must now use `doctype`/.test(err.message))
    });
    async('deprecates `doctype 5` in favour of `doctype html`', function* () {
      var err = yield getError('doctype 5', {filename: 'test.jade'})
      assert(/test\.jade:1/.test(err.message))
      assert(/`doctype 5` is deprecated, you must now use `doctype html`/.test(err.message))
    });
  });
});
