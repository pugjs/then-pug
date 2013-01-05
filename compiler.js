/*!
 * Jade - Compiler
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var nodes = require('jade').nodes
  , doctypes = require('jade').doctypes
  , selfClosing = require('jade').selfClosing
  , runtime = require('jade').runtime
  , utils = require('jade').utils
  , oldCompiler = require('jade').Compiler;


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

var consolidate = require('then-build');

/**
 * Initialize `Compiler` with the given `node`.
 *
 * @param {Node} node
 * @param {Object} options
 * @api public
 */

var Compiler = module.exports = function Compiler(node, options) {
  oldCompiler.apply(this, arguments);
};

/**
 * Compiler prototype.
 */

Compiler.prototype = Object.create(oldCompiler.prototype);
Compiler.prototype.constructor = Compiler;

  /**
   * Visit `filter`, throwing when the filter does not exist.
   *
   * @param {Filter} filter
   * @api public
   */

Compiler.prototype.visitFilter = function(filter){

  var text = filter.block.nodes.map(
    function(node){ return node.val; }
  ).join('\n');

  if (filter.name === 'cdata') return this.buffer(utils.text('<![CDATA[\\n' + text + '\\n]]>'));

  if (!consolidate[filter.name]) throw new Error('unknown filter ":' + filter.name + '"');

  filter.attrs = filter.attrs || {};
  filter.attrs.filename = '"' + this.options.filename + '"';

  var attrs = Object.keys(filter.attrs).map(function (key) { return { name: key, val: filter.attrs[key]} });
  attrs = this.attrs(attrs);
  if (attrs.constant) {
    attrs = eval('({' + attrs.buf + '})');
    this.buffer(render(filter.name, text, attrs, true));
  } else {
    this.buf.push('buf.push(render("' + filter.name + '", ' + JSON.stringify(text) + ', {' + attrs.buf + '}, false))')
  }
};

Compiler.render = render;
function render(name, text, attrs, isCompileTime) {
  return consolidate[name].render(text, attrs).then(function (res) {
      if (consolidate[name].outExtension === 'css') {
        res = '<style type="text/css">' + res + '</style>';
      } else if (consolidate[name].outExtension === 'js') {
        res = '<script type="text/javascript">\n' + res + '</script>';
      }
      if (isCompileTime) res = res.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
      return utils.text(res.replace(/'/g,'&#39;'))
    })
}

  /**
   * Buffer the given `str` optionally escaped.
   *
   * @param {String} str
   * @param {Boolean} esc
   * @api public
   */

Compiler.prototype.buffer = function(str, esc){
  str = when(str);
  if (esc) str = str.then(utils.escape);

  if (this.lastBufferedIdx == this.buf.length) {
    this.lastBuffered = all(this.lastBuffered, str)
      .then(function (res) {
        return res.join('')
      });
    this.buf[this.lastBufferedIdx - 1] = this.lastBuffered.then(function (res) { return "buf.push('" + res + "');"; });
  } else {
    this.buf.push(str.then(function (str) { return "buf.push('" + str + "');"}));
    this.lastBuffered = str;
    this.lastBufferedIdx = this.buf.length;
  }
}

    /**
   * Compile parse tree to JavaScript.
   *
   * @api public
   */

Compiler.prototype.compile = function(){
  this.buf = ['var interp;'];
  if (this.pp) this.buf.push("var __indent = [];");
  this.lastBufferedIdx = -1;
  this.visit(this.node);
  return all(this.buf).then(function (buf) { return buf.join('\n'); });
};