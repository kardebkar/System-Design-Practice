module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!jest.config.js'
  ],
  testMatch: ['**/tests/**/*.test.js'],
  globalSetup: './tests/setup.js',
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true
};