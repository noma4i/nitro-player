const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const rootNodeModules = path.resolve(projectRoot, 'node_modules');

const config = {
  resolver: {
    extraNodeModules: {
      react: path.join(rootNodeModules, 'react'),
      'react-native': path.join(rootNodeModules, 'react-native'),
      'react-native-nitro-modules': path.join(rootNodeModules, 'react-native-nitro-modules'),
    },
    nodeModulesPaths: [rootNodeModules],
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
