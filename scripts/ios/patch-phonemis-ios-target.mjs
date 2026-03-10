#!/usr/bin/env node
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const podfilePath = path.join(projectRoot, 'ios', 'Podfile');

const ensureExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const patchPodfile = (contents) => {
  const targetPattern = /(target\s+['\"]PhoneMIS['\"]\s+do[\s\S]*?end)/m;
  if (!targetPattern.test(contents)) {
    return { changed: false, output: contents, reason: 'PhoneMIS target not present' };
  }

  if (contents.includes("platform :ios, '15.1'")) {
    return { changed: false, output: contents, reason: 'iOS target already set' };
  }

  const headerPattern = /^platform\s+:ios,\s+['\"][0-9.]+['\"]\s*$/m;
  if (headerPattern.test(contents)) {
    return {
      changed: true,
      output: contents.replace(headerPattern, "platform :ios, '15.1'"),
      reason: 'Updated global platform version',
    };
  }

  return {
    changed: true,
    output: `platform :ios, '15.1'\n${contents}`,
    reason: 'Added global platform version',
  };
};

const run = async () => {
  const hasPodfile = await ensureExists(podfilePath);
  if (!hasPodfile) {
    console.log('[postinstall] ios/Podfile not found, skipping PhoneMIS iOS target patch.');
    return;
  }

  const contents = await readFile(podfilePath, 'utf8');
  const patched = patchPodfile(contents);

  if (!patched.changed) {
    console.log(`[postinstall] ${patched.reason}, no changes made.`);
    return;
  }

  await writeFile(podfilePath, patched.output, 'utf8');
  console.log(`[postinstall] ${patched.reason}.`);
};

run().catch((error) => {
  console.error('[postinstall] Failed to patch iOS target:', error);
  process.exitCode = 1;
});
