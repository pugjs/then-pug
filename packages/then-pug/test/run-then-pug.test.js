'use strict';

const fs = require('fs');
const assert = require('assert');
const mkdirp = require('mkdirp').sync;
const runUtils = require('./run-utils');
const pug = require('../');

const testDir = '/cases';
const testSuffix = '-then-pug';
var cases = runUtils.findCases(__dirname + testDir + testSuffix);

mkdirp(__dirname + '/output' + testSuffix);

describe('test cases for then-pug specific features', function () {
  cases.forEach(runUtils.testSingle.bind(null, it, testDir, testSuffix));
});
