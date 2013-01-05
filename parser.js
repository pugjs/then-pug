/*!
 * Jade - Compiler
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var oldParser = require('jade').Parser;
var nodes = require('jade').nodes;

/**
 * Initialize `Compiler` with the given `node`.
 *
 * @param {Node} node
 * @param {Object} options
 * @api public
 */

module.exports = Parser;
function Parser(str, filename, options) {
  oldParser.apply(this, arguments);
};

/**
 * Compiler prototype.
 */

Parser.prototype = Object.create(oldParser.prototype);
Parser.prototype.constructor = Parser;

/**
 * filter attrs? text-block
 */
Parser.prototype.parseFilter = function(){
  var block = null, include = null;
  
  var tok = this.expect('filter')
  var attrs = this.accept('attrs');

  if (this.peek().type === 'text') {
    include = this.parseText();

    include.nodes = [];//dummy so that the `Filter` constructor won't throw
  } else {
    this.lexer.pipeless = true;
    block = this.parseTextBlock();
    this.lexer.pipeless = false;
  }

  var node = new nodes.Filter(tok.val, (block || include), attrs && attrs.attrs);
  node.isInclude = include != null;
  node.line = this.line();
  return node;
};