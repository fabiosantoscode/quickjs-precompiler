import { readFileSync } from "fs";

const config = JSON.parse(readFileSync(`${import.meta.dirname}/.swcrc`, 'utf-8'))

export default {
  testEnvironment: 'node',
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
