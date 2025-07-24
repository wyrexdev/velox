module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    testMatch: ["**/__tests__/**/*.test.[jt]s?(x)", "**/?(*.)+(spec|test).[tj]s?(x)"],
    testPathIgnorePatterns: ["/node_modules/", "src/__tests__/setup.ts"],
    transform: {
        "^.+\\.ts$": "ts-jest",
    },
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/**/*.d.ts",
        "!src/examples/**/*",
        "!src/benchmarks/**/*",
        "!src/__tests__/**/*",
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html"],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
    },
    setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
    testTimeout: 30000,
    verbose: true,
    collectCoverage: false,
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },
}
