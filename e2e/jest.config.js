module.exports = {
  testTimeout: 240000,
  maxWorkers: 1,
  roots: ["<rootDir>/specs"],
  testMatch: ["**/*.e2e.js"],
  setupFilesAfterEnv: ["<rootDir>/init.js"],
};
