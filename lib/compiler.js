'use strict';

var BaseCompiler = require('jade/lib/compiler');

module.exports = Compiler;
function Compiler(node, options) {
  BaseCompiler.call(this, node, options);
}

Compiler.prototype = Object.create(BaseCompiler.prototype);
Compiler.prototype.constructor = Compiler;

Compiler.prototype.visitMixinBlock = function (block) {
  if (this.pp) this.buf.push("jade_indent.push('" + Array(this.indents + 1).join('  ') + "');");
  this.buf.push('block && (yield* block());');
  if (this.pp) this.buf.push("jade_indent.pop();");
};

Compiler.prototype.visitMixin = function (mixin) {
    var name = 'jade_mixins[';
    var args = mixin.args || '';
    var block = mixin.block;
    var attrs = mixin.attrs;
    var attrsBlocks = mixin.attributeBlocks;
    var pp = this.pp;
    var dynamic = mixin.name[0]==='#';
    var key = mixin.name;
    if (dynamic) this.dynamicMixins = true;
    name += (dynamic ? mixin.name.substr(2,mixin.name.length-3):'"'+mixin.name+'"')+']';

    if (mixin.call) {
      if (this.mixins[key]) {
        // clear list of mixins with this key so they are not removed
        this.mixins[key] = [];
      } else {
        // todo: throw error for calling a mixin that's not defined
      }
      if (pp) this.buf.push("jade_indent.push('" + Array(this.indents + 1).join('  ') + "');")
      if (block || attrs.length || attrsBlocks.length) {

        this.buf.push('yield* ' + name + '.call({');

        if (block) {
          this.buf.push('block: function*(){');

          // Render block with no indents, dynamically added when rendered
          this.parentIndents++;
          var _indents = this.indents;
          this.indents = 0;
          this.visit(mixin.block);
          this.indents = _indents;
          this.parentIndents--;

          if (attrs.length || attrsBlocks.length) {
            this.buf.push('},');
          } else {
            this.buf.push('}');
          }
        }

        if (attrsBlocks.length) {
          if (attrs.length) {
            var val = this.attrs(attrs);
            attrsBlocks.unshift(val);
          }
          this.buf.push('attributes: jade.merge([' + attrsBlocks.join(',') + '])');
        } else if (attrs.length) {
          var val = this.attrs(attrs);
          this.buf.push('attributes: ' + val);
        }

        if (args) {
          this.buf.push('}, ' + args + ');');
        } else {
          this.buf.push('});');
        }

      } else {
        this.buf.push('yield* ' + name + '(' + args + ');');
      }
      if (pp) this.buf.push("jade_indent.pop();")
    } else {
      var mixin_start = this.buf.length;
      this.buf.push(name + ' = function*(' + args + '){');
      this.buf.push('var block = (this && this.block), attributes = (this && this.attributes) || {};');
      this.parentIndents++;
      this.visit(block);
      this.parentIndents--;
      this.buf.push('};');
      var mixin_end = this.buf.length;
      this.mixins[key] = this.mixins[key] || [];
      this.mixins[key].push({start: mixin_start, end: mixin_end});
    }
};

Compiler.prototype.visitEach = function (each) {
  this.buf.push(''
    + '// iterate ' + each.obj + '\n'
    + ';yield* (function*(){\n'
    + '  var $$obj = ' + each.obj + ';\n'
    + '  if (\'number\' == typeof $$obj.length) {\n');

  if (each.alternative) {
    this.buf.push('  if ($$obj.length) {');
  }

  this.buf.push(''
    + '    for (var ' + each.key + ' = 0, $$l = $$obj.length; ' + each.key + ' < $$l; ' + each.key + '++) {\n'
    + '      var ' + each.val + ' = $$obj[' + each.key + '];\n');

  this.visit(each.block);

  this.buf.push('    }\n');

  if (each.alternative) {
    this.buf.push('  } else {');
    this.visit(each.alternative);
    this.buf.push('  }');
  }

  this.buf.push(''
    + '  } else {\n'
    + '    var $$l = 0;\n'
    + '    for (var ' + each.key + ' in $$obj) {\n'
    + '      $$l++;'
    + '      var ' + each.val + ' = $$obj[' + each.key + '];\n');

  this.visit(each.block);

  this.buf.push('    }\n');
  if (each.alternative) {
    this.buf.push('    if ($$l === 0) {');
    this.visit(each.alternative);
    this.buf.push('    }');
  }
  this.buf.push('  }\n}).call(this);\n');
};