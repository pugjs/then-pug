'use strict';

var INTERNAL_VARIABLES = [
  'pug',
  'pug_mixins',
  'pug_interp',
  'pug_debug_filename',
  'pug_debug_line',
  'pug_debug_sources',
  'pug_html',
  'buf'
];


/**
 * Module dependencies.
 */
var BaseCodeGenerator = require('./pug-code-gen-module.js').CodeGenerator;
var t = require('@babel/types');
var { default: babelTemplate } = require('@babel/template');
var findGlobals = require('with/lib/globals.js')
var stringify = require('js-stringify');
var babylon = require('babylon');


/**
 * Inherit from base code generator
 */
module.exports = generateCode;
module.exports.CodeGenerator = Compiler;
function generateCode(ast, options) {
  return (new Compiler(ast, options)).compile();
}

function Compiler(node, options) {
  BaseCodeGenerator.call(this, node, options);
  this.dynamicMixins = true;
  this.useGenerators = true;
  this.templateVars = ['locals', 'pug', 'buf'];
}
Compiler.prototype = Object.create(BaseCodeGenerator.prototype);
Compiler.prototype.constructor = Compiler;

Compiler.prototype.parseExpr= function(expr) {
  return babylon.parse('function*g(){return e='+expr+'}').program.body[0].body.body[0].argument.right;
}

Compiler.prototype.ast_with = function(ast) {
  let exclude = this.options.globals ? this.options.globals.concat(INTERNAL_VARIABLES) : INTERNAL_VARIABLES;
  exclude = exclude.concat(this.runtimeFunctionsUsed.map(function (name) { return 'pug_' + name; }));
  exclude.push('undefined', 'this', 'locals')
  let vars = findGlobals(t.program(ast)).map(function(v) { return v.name }).filter(function(v) { return exclude.indexOf(v) === -1 })
  if (vars.length > -1) {
    let bag = 'locals'
    ast = [t.variableDeclaration('var', [t.variableDeclarator(t.identifier('_ret'),
      t.callExpression(
        t.memberExpression(t.functionExpression(null, vars.map(function(v) { return t.identifier(v)}), t.blockStatement([t.functionDeclaration(t.identifier('gen'), [], t.blockStatement(ast), this.useGenerators), t.returnStatement(t.objectExpression([t.objectProperty(t.identifier('v'), t.identifier('gen'))]))])), t.identifier('call')),
        [ t.thisExpression() ].concat(vars.map(function(v) {
          return t.conditionalExpression(
            t.binaryExpression('in', t.stringLiteral(v), t.identifier('_ref')),
            t.memberExpression(t.identifier('_ref'), t.identifier(v)),
            t.conditionalExpression(
              t.binaryExpression('!==', t.unaryExpression('typeof', t.identifier(v)), t.stringLiteral('undefined')),
              t.identifier(v),
              t.identifier('undefined')
            )
          )
        }))
      ))])]
  }
  return ast;
}





Compiler.prototype.wrapCallExpression = function(node) {
  return t.yieldExpression(node, true);
}

Compiler.prototype.ast_variableDeclaration = function() {
    return t.variableDeclaration('var', [
          t.variableDeclarator(t.identifier('pug_mixins'),
            t.logicalExpression('||',
              t.memberExpression(t.identifier('locals'),t.identifier('pug_mixins')) ,
              t.objectExpression([]))),
          t.variableDeclarator(t.identifier('pug_interp'), null),
          t.variableDeclarator(t.identifier('_ref'),
            t.logicalExpression('||',
              t.identifier('locals') ,
              t.objectExpression([])))
        ])
}

Compiler.prototype.ast_return = function(stringLiteral) {
  return [t.returnStatement(t.memberExpression(t.identifier('_ret'), t.identifier('v')))];
}

Compiler.prototype.ast_stringify = function(stringLiteral) {
  return stringLiteral;
}

Compiler.prototype.ast_buffer = function(node) {
    return [t.expressionStatement(
              t.callExpression(
                t.memberExpression(t.identifier('buf'), t.identifier('push')),
                [node])
            )];
}

Compiler.prototype.ast_postprocess = function(ast) {
    let needCompaction = function(c) {
      return t.isExpressionStatement(c)
                && t.isCallExpression(c.expression)
                && t.isMemberExpression(c.expression.callee)
                && t.isIdentifier(c.expression.callee.object)
                && c.expression.callee.object.name === 'buf'
                && t.isIdentifier(c.expression.callee.property)
                && c.expression.callee.property.name === 'push'
    }

    let walk = function (node) {
      Object.keys(node).forEach(function(k) {
        var child = node[k];
        if (child && typeof child === "object" && child.length) {
          child.forEach(function (c) {
            if (c && typeof c.type === 'string') {
              walk(c);
            }
          });
          let i,j;
          for (i=0; i<child.length; i++) {
            let start, end;
            let fragment = []
            if (needCompaction(child[i])) {
              start = i;
              end = i;
              // locate sequential buffer operations
              while (needCompaction(child[end]) && end < child.length && fragment.length < 101) {
                fragment.push(child[end].expression.arguments[0])
                end++;
              }

              // join adjacent stringLiterals
              for (j=0; j<fragment.length;j++) {
                let start, end;
                if (t.isStringLiteral(fragment[j])) {
                  start = j;
                  end = j;
                  while (t.isStringLiteral(fragment[end]) && end < fragment.length) {
                   end++
                  }
                  let lit = t.stringLiteral(fragment.slice(start, end).map(function(v) { return v.value}).join(''));
                  lit.extra = { rawValue: lit.value, raw: stringify(lit.value)}
                  fragment.splice(start, end-start, lit)
                }
              }

              // join fragments
              let expr =
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.identifier('buf'),
                      t.identifier('push')
                    ),
                    [
                      fragment.reduce(function(acc, val) {
                        return t.binaryExpression('+', acc, val);
                      })
                    ]
                  )
                )
              child.splice(start, end-start, expr)
            }
          }
        } else if (child && typeof child.type === 'string') {
          walk(child);
        }
      })      
    };
    walk(ast);
    return ast;
}
