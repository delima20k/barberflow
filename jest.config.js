'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Exibe o nome do teste em cada linha (mesmo sem falha) para rastreabilidade no CI
  verbose: true,
};
