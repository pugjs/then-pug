var fs = require('fs');
var assert = require('assert');
var pug = require('../');
var uglify = require('uglify-js');
var mkdirp = require('mkdirp').sync;
var Promise = require('promise');

var filters = {
  custom: function (str, options) {
    assert(options.opt === 'val');
    assert(options.num === 2);
    return 'BEGIN' + str + 'END';
  }
};

// test cases

function writeFileSync(filename, data) {
  try {
    if (fs.readFileSync(filename, 'utf8') === data.toString('utf8')) {
      return;
    }
  } catch (ex) {
    if (ex.code !== 'ENOENT') {
      throw ex;
    }
  }
  fs.writeFileSync(filename, data);
}

function findCases(dir) {
  return fs.readdirSync(dir).filter(function(file){
    return ~file.indexOf('.pug');
  }).map(function(file){
    return file.replace('.pug', '');
  });
}

function testSingle(it, caseDir, suffix, test){
  var name = test.replace(/[-.]/g, ' ');
  it(name, function(){
    var path = __dirname + caseDir + suffix + '/' + test + '.pug';
    var str = fs.readFileSync(path, 'utf8');
    var fn = pug.compile(str, {
      filename: path,
      pretty: true,
      basedir: __dirname + caseDir + suffix,
      filters: filters,
      filterAliases: {'markdown': 'markdown-it'},
    });
    process.chdir(__dirname);
    var d_actual = fn({
      title: 'Pug',
      readdir: Promise.denodeify(fs.readdir),
      stat: Promise.denodeify(fs.stat)
    });
    var html = fs.readFileSync(__dirname + caseDir + suffix + '/' + test + '.html', 'utf8').trim().replace(/\r/g, '');

    var clientCode = uglify.minify(pug.compileClient(str, {
      filename: path,
      pretty: true,
      compileDebug: false,
      basedir: __dirname + caseDir + suffix,
      filters: filters,
      filterAliases: {'markdown': 'markdown-it'},
    }), {output: {beautify: true}, mangle: false, compress: false, fromString: true}).code;
 

    return d_actual.then(function(actual) {
      writeFileSync(__dirname + '/output' + suffix + '/' + test + '.html', actual);
      if (/filter/.test(test)) {
        actual = actual.replace(/\n| /g, '');
        html = html.replace(/\n| /g, '');
      }

      // then-pug keeps all mixins on purpose in order to be able to extract mixins via locals.pug_mixins
      if (/mixins-unused/.test(test)) {
        assert(/never-called/.test(str), 'never-called is in the pug file for mixins-unused');
        assert(/never-called/.test(clientCode), 'never-called should be found the code');
      }
      expect(actual.trim()).toEqual(html);
    })
/*
    var clientCodeDebug = uglify.minify(pug.compileClient(str, {
      filename: path,
      pretty: true,
      compileDebug: true,
      basedir: __dirname + '/cases' + suffix,
      filters: filters,
      filterAliases: {'markdown': 'markdown-it'},
    }), {output: {beautify: true}, mangle: false, compress: false, fromString: true}).code;
    writeFileSync(__dirname + '/output' + suffix + '/' + test + '.js', uglify.minify(pug.compileClient(str, {
      filename: path,
      pretty: false,
      compileDebug: false,
      basedir: __dirname + '/cases' + suffix,
      filters: filters,
      filterAliases: {'markdown': 'markdown-it'},
    }), {output: {beautify: true}, mangle: false, compress: false, fromString: true}).code);
*/
/*
    actual = Function('pug', clientCode + '\nreturn template;')()({ title: 'Pug' });
    if (/filter/.test(test)) {
      actual = actual.replace(/\n| /g, '');
    }
    expect(actual.trim()).toEqual(html);
    actual = Function('pug', clientCodeDebug + '\nreturn template;')()({ title: 'Pug' });
    if (/filter/.test(test)) {
      actual = actual.replace(/\n| /g, '');
    }
    expect(actual.trim()).toEqual(html);
*/
  });
}


module.exports = {
  filters,
  findCases,
  testSingle,
};
