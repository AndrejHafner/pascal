module.exports = {
  preset: 'jest-expo',
  restoreMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/testUtils/', '/fixtures/'],
  // @testing-library/react-native requires 'test-renderer' as a bare alias
  // for react-test-renderer — RN's own Metro config resolves this, but
  // neither jest-expo nor @react-native/jest-preset maps it for Jest.
  moduleNameMapper: {
    '^test-renderer$': 'react-test-renderer',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
}
