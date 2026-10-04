module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    // See metro.config.js: react-native-svg imports the pre-0.87 registry path.
    '^@react-native/assets-registry/registry$':
      '<rootDir>/node_modules/react-native/src/asset-registry.js',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@react-native-clipboard|@react-navigation|react-native-svg|react-native-qrcode-svg|react-native-screens|react-native-safe-area-context)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
