const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// React Native 0.87 moved the asset registry into core
// (`react-native/asset-registry`). react-native-svg still imports the old
// `@react-native/assets-registry/registry` path, so point it at core's
// registry to keep a single registry instance.
const LEGACY_ASSET_REGISTRY = '@react-native/assets-registry/registry';

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) =>
      context.resolveRequest(
        context,
        moduleName === LEGACY_ASSET_REGISTRY
          ? 'react-native/asset-registry'
          : moduleName,
        platform,
      ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
