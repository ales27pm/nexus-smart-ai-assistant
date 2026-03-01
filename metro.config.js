const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Ensure metro resolves imports of 'balanced-match' to our shim which
// provides a named `balanced` export for ESM-style imports used in
// some dependency bundles.
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = Object.assign({}, config.resolver.extraNodeModules, {
	'balanced-match': path.resolve(__dirname, 'shims/balanced-match.js'),
});

module.exports = withRorkMetro(config);
