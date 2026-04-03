import type { Config } from 'jest';

const config: Config = {
  displayName: 'subscription-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/subscription-service',
  testMatch: ['**/__tests__/**/*.spec.ts', '**/*.spec.ts'],
};

export default config;
