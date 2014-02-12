
/**
 * Module dependencies.
 */

var fs = require('fs');
var assert = require('assert');
var ty = require('then-yield');
var uglify = require('uglify-js');
var Promise = require('promise');
var jade = require('../');

// create output directory
try {
  fs.mkdirSync(__dirname + '/output');
} catch (ex) {
  if (ex.code !== 'EEXIST') {
    throw ex;
  }
}

// test cases

var cases = fs.readdirSync('test/cases').filter(function(file){
  return ~file.indexOf('.jade');
}).map(function(file){
  return file.replace('.jade', '');
});

cases.forEach(function(test){
  var name = test.replace(/[-.]/g, ' ');
  async(name, function* () {
    var path = 'test/cases/' + test + '.jade';
    var str = fs.readFileSync(path, 'utf8');
    var html = fs.readFileSync('test/cases/' + test + '.html', 'utf8').trim().replace(/\r/g, '');
    var fn = jade.compile(str, { filename: path, pretty: true, basedir: 'test/cases' });
    var actual = yield fn({title: 'Jade'});

    fs.writeFileSync(__dirname + '/output/' + test + '.html', actual)
    if (/filter/.test(test)) {
      actual = actual.replace(/\n| /g, '');
      html = html.replace(/\n| /g, '');
    }
    JSON.stringify(actual.trim()).should.equal(JSON.stringify(html.trim()));
  });
});

// test yield-cases

var generators = fs.readdirSync('test/gn-cases').filter(function(file){
  return ~file.indexOf('.jade');
}).map(function(file){
  return file.replace('.jade', '');
});

generators.forEach(function(test){
  var name = test.replace(/[-.]/g, ' ');
  async(name, function*() {
    var path = 'test/gn-cases/' + test + '.jade';
    var str = fs.readFileSync(path, 'utf8');
    var html = fs.readFileSync('test/gn-cases/' + test + '.html', 'utf8').trim().replace(/\r/g, '');
    var fn = jade.compile(str, { filename: path, pretty: true, basedir: 'test/gn-cases' });

    var locals = {
      message: 'Jade',
      readdir: Promise.denodeify(fs.readdir),
      stat: Promise.denodeify(fs.stat)
    }

    var actual = yield fn(locals);
    fs.writeFileSync(__dirname + '/output/' + test + '.html', actual)
    JSON.stringify(actual.trim()).should.equal(JSON.stringify(html));
  });
});
