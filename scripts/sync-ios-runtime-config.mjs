#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const appConfigPath = new URL("../app.json", import.meta.url);
const podfilePropsPath = new URL("../Podfile.properties.json", import.meta.url);

const appConfig = JSON.parse(await readFile(appConfigPath, "utf8"));
const podfileProps = JSON.parse(await readFile(podfilePropsPath, "utf8"));

const expoConfig = appConfig.expo ?? {};
const iosConfig = expoConfig.ios ?? {};

const iosJsEngine = iosConfig.jsEngine ?? expoConfig.jsEngine;
if (!iosJsEngine) {
  throw new Error(
    "Unable to resolve iOS jsEngine from app.json (expo.ios.jsEngine or expo.jsEngine).",
  );
}

const iosNewArchEnabled = iosConfig.newArchEnabled ?? expoConfig.newArchEnabled;
if (typeof iosNewArchEnabled !== "boolean") {
  throw new Error(
    "Unable to resolve iOS newArchEnabled from app.json (expo.ios.newArchEnabled or expo.newArchEnabled).",
  );
}

const nextPodfileProps = {
  ...podfileProps,
  newArchEnabled: String(iosNewArchEnabled),
  "expo.jsEngine": iosJsEngine,
};

await writeFile(
  podfilePropsPath,
  `${JSON.stringify(nextPodfileProps, null, 2)}\n`,
);
console.log(
  "Synced iOS runtime settings from app.json -> Podfile.properties.json",
);
