#!/bin/bash
set -e

# Start the EAS local build in background and tee the output
./scripts/workflow.sh --step build 2>&1 | tee build-output.log &
BUILD_PID=$!

echo "Started build (pid=$BUILD_PID), watching for temp build directory..."

# Poll for the temporary EAS build copy
while true; do
  for d in /private/var/folders/*/*/T/eas-build-local-nodejs/*; do
    if [ -d "$d/build" ]; then
      echo "FOUND_BUILD_DIR: $d/build"
      ls -la "$d/build" || true

      if [ -f "$d/build/babel.config.js" ]; then
        echo "--- babel.config.js ---"
        sed -n '1,200p' "$d/build/babel.config.js" || true
        echo "--- end babel.config.js ---"
      else
        echo "NO babel.config.js in build copy"
      fi

      if [ -f "$d/build/package.json" ]; then
        echo "--- package.json ---"
        sed -n '1,200p' "$d/build/package.json" || true
        echo "--- end package.json ---"
      else
        echo "NO package.json in build copy"
      fi

      if [ -d "$d/build/node_modules" ]; then
        echo "--- node_modules listing (top) ---"
        ls -la "$d/build/node_modules" | sed -n '1,200p' || true
        echo "--- end node_modules listing ---"
      else
        echo "NO node_modules in build copy"
      fi

      if [ -d "$d/build/node_modules/babel-plugin-module-resolver" ]; then
        echo "PLUGIN_PRESENT: babel-plugin-module-resolver found"
      else
        echo "PLUGIN_MISSING: babel-plugin-module-resolver not found"
      fi

      # Do not kill the build; allow it to continue so install and bundling complete.
      exit 0
    fi
  done
  sleep 1
done
