const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const {
  createRunOncePlugin,
  withDangerousMod,
  withPodfileProperties,
  withXcodeProject,
} = require("expo/config-plugins");

const PLUGIN_NAME = "with-consistent-ios-deployment-target";
const PLUGIN_VERSION = "1.0.0";

function withConsistentIosDeploymentTarget(config, { deploymentTarget }) {
  if (!deploymentTarget) {
    throw new Error(
      `${PLUGIN_NAME}: missing required "deploymentTarget" option`,
    );
  }

  config = withPodfileProperties(config, (config) => {
    config.modResults["ios.deploymentTarget"] = deploymentTarget;
    return config;
  });

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    for (const section of Object.values(
      project.pbxXCBuildConfigurationSection(),
    )) {
      if (!section || typeof section !== "object" || !section.buildSettings) {
        continue;
      }

      section.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
    }

    return config;
  });

  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = join(
        config.modRequest.platformProjectRoot,
        "Podfile",
      );
      const podfile = readFileSync(podfilePath, "utf8");
      const nextPodfile = podfile.replace(
        /podfile_properties\['ios\.deploymentTarget'\] \|\| '\d+\.\d+'/,
        `podfile_properties['ios.deploymentTarget'] || '${deploymentTarget}'`,
      );

      if (nextPodfile !== podfile) {
        writeFileSync(podfilePath, nextPodfile);
      }

      return config;
    },
  ]);

  return config;
}

module.exports = createRunOncePlugin(
  withConsistentIosDeploymentTarget,
  PLUGIN_NAME,
  PLUGIN_VERSION,
);
