import { readFileSync } from "fs";

const config = JSON.parse(readFileSync(`${import.meta.dirname}/.swcrc`, 'utf-8'))

/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  coverageProvider: 'v8',
  setupFilesAfterEnv: [],
  extensionsToTreatAsEsm: ['.ts'],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        ...config,
      },
    ],
  },
};
