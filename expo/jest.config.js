module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  collectCoverageFrom: ["utils/**/*.ts"],
  moduleNameMapper: {
    "^@/modules/expo-coreml-llm$": "<rootDir>/__mocks__/expoCoreMLLLM.ts",
  },
};
