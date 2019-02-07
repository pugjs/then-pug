'use strict';

const fs = require('fs');
const assert = require('assert');
const mkdirp = require('mkdirp').sync;
const runUtils = require('./run-utils');
const pug = require('../');

const testDir = '/../../pug/test/cases';
const testSuffix = '-es2015';
var cases = runUtils.findCases(__dirname + testDir + testSuffix);

mkdirp(__dirname + '/output' + testSuffix);

describe('test cases for ECMAScript 2015', function () {
  try {
    eval('``');
    cases.forEach(runUtils.testSingle.bind(null, it, testDir, testSuffix));
  } catch (ex) {
    cases.forEach(runUtils.testSingle.bind(null, it.skip, testDir, testSuffix));
  }
});
