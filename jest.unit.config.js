module.exports = {
  testMatch: ['<rootDir>/test/unit/**/*.test.js'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/env.js'],
  moduleNameMapper: {
    '^openai$': '<rootDir>/test/__mocks__/openai-stub.js',
    // Jest 24 does not resolve `node:`-prefixed builtins; see the README there.
    '^node:(.+)$': '<rootDir>/test/support/node-builtins/$1.js',
  },
  resolver: '<rootDir>/test/support/jest-resolver.js',
};
