/** @type {import('jest').Config} */
module.exports = {
  testMatch: ["**/tests/**/*.test.js"],
  testEnvironment: "node",
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
