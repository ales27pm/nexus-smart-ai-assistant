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

function resolveSimulatorName() {
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

  const parsed = JSON.parse(listResult.stdout);
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

if (typeof expoResult.status === "number" && expoResult.status !== 0) {
  process.exit(expoResult.status);
}
