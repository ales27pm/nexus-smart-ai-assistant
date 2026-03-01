module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      [
        // Use require.resolve so the transformer can locate the plugin in the
        // build copy's node_modules during EAS local builds.
        require.resolve("babel-plugin-module-resolver"),
        {
          root: ["./"],
          alias: {
            "@": "./"
          }
        }
      ]
    ],
  };
};