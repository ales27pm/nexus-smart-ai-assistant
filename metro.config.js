const path = require('path');
let { getDefaultConfig } = require('expo/metro-config');

let config = getDefaultConfig(__dirname);

config.resolver = {
  ...(config.resolver || {}),
  extraNodeModules: {
    ...(config.resolver && config.resolver.extraNodeModules ? config.resolver.extraNodeModules : {}),
    '@': path.resolve(__dirname),
  },
};

// Provide a custom resolver that rewrites imports starting with "@/"
// to the project root. This ensures Metro resolves '@/foo' style imports
// inside the ephemeral EAS build copy where Babel transforms may not run
// early enough for certain bundling steps.
try {
  const { resolve } = require('metro-resolver');
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (typeof moduleName === 'string' && moduleName.startsWith('@/')) {
      const rewritten = path.join(__dirname, moduleName.replace(/^@\//, ''));
      return resolve(context, rewritten, platform);
    }
    return resolve(context, moduleName, platform);
  };
} catch (e) {
  // metro-resolver may not be available in all environments; fall back to
  // letting Metro use its default resolver.
}

config.watchFolders = Array.from(new Set([...(config.watchFolders || []), path.resolve(__dirname)]));

try {
  const { withRorkMetro } = require('@rork-ai/toolkit-sdk/metro');
  module.exports = withRorkMetro(config);
} catch (e) {
  module.exports = config;
}
