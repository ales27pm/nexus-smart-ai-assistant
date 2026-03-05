#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const preferredSimulators = [
  "iPhone 16 Pro",
  "iPhone 16",
  "iPhone 15 Pro",
  "iPhone 15",
  "iPhone 14 Pro",
  "iPhone 14",
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
}

function ensureDarwinWithXcode() {
  if (process.platform !== "darwin") {
    throw new Error(
      "`npm run ios` requires macOS with Xcode tools installed. Use this script on macOS, or run platform-specific alternatives such as `npm run android`.",
    );
  }

  const xcrunVersion = run("xcrun", ["--version"]);
  if (xcrunVersion.error || xcrunVersion.status !== 0) {
    throw new Error(
      "Unable to run `xcrun`. Ensure Xcode and Xcode Command Line Tools are installed and selected (`xcode-select --install`, then `sudo xcode-select -s /Applications/Xcode.app`).",
    );
  }
}

function parseSimctlJson(listResult) {
  try {
    return JSON.parse(listResult.stdout);
  } catch (error) {
    const stdoutPreview =
      typeof listResult.stdout === "string"
        ? listResult.stdout.slice(0, 1000)
        : "";
    const stderrPreview =
      typeof listResult.stderr === "string"
        ? listResult.stderr.slice(0, 1000)
        : "";
    const originalMessage =
      error instanceof Error ? error.message : String(error);

    let message =
      "Failed to parse JSON output from `xcrun simctl list devices available --json`.\n" +
      `Original error: ${originalMessage}\n` +
      "stdout (truncated):\n" +
      stdoutPreview;

    if (stderrPreview) {
      message += "\nstderr (truncated):\n" + stderrPreview;
    }

    throw new Error(message);
  }
}

function resolveSimulatorName() {
  ensureDarwinWithXcode();

  const listResult = run("xcrun", [
    "simctl",
    "list",
    "devices",
    "available",
    "--json",
  ]);

  if (listResult.status !== 0) {
    throw new Error(
      `Failed to query iOS simulators via xcrun simctl.\n${listResult.stderr || listResult.stdout}`,
    );
  }

  const parsed = parseSimctlJson(listResult);
  const runtimes = Object.values(parsed.devices ?? {});
  const availableDevices = runtimes
    .flatMap((runtimeDevices) => runtimeDevices)
    .filter((device) => device?.isAvailable);

  if (availableDevices.length === 0) {
    throw new Error(
      "No available iOS Simulators were found. Install one from Xcode > Settings > Platforms.",
    );
  }

  const bootedIPhone = availableDevices.find(
    (device) => device.state === "Booted" && device.name?.startsWith("iPhone"),
  );

  if (bootedIPhone) {
    return bootedIPhone.name;
  }

  for (const preferredName of preferredSimulators) {
    const matchingDevice = availableDevices.find(
      (device) => device.name === preferredName,
    );
    if (matchingDevice) {
      return matchingDevice.name;
    }
  }

  const fallbackIPhone = availableDevices.find((device) =>
    device.name?.startsWith("iPhone"),
  );
  if (fallbackIPhone) {
    return fallbackIPhone.name;
  }

  return availableDevices[0].name;
}

const simulatorName = resolveSimulatorName();
const passthroughArgs = process.argv.slice(2);

console.log(`Using simulator: ${simulatorName}`);

const expoResult = spawnSync(
  "npx",
  ["expo", "run:ios", "--simulator", simulatorName, ...passthroughArgs],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (expoResult.error) {
  throw expoResult.error;
}

if (expoResult.signal) {
  throw new Error(`expo run:ios terminated by signal ${expoResult.signal}.`);
}

if (typeof expoResult.status === "number" && expoResult.status !== 0) {
  process.exit(expoResult.status);
}
