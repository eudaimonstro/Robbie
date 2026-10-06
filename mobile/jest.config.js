module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@robbie/shared)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // The shared package only exports an "import" condition, which Jest's resolver doesn't use.
    // Point it at the built package (npm run build:shared), as the type-checker sees it.
    '^@robbie-bylawyer/shared/(types|reducer|constants|utils)$':
      '<rootDir>/../shared/dist/$1/index.js',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'context/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
