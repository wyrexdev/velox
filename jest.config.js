module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
    transform: {
        "^.+\\.ts$": "ts-jest",
    },
    collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/examples/**/*", "!src/benchmarks/**/*"],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html"],
    moduleNameMapping: {
        "^@/(.*)$": "<rootDir>/src/$1",
    },
    setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
    testTimeout: 30000,
}
