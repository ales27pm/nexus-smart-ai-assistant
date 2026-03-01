#!/bin/bash
set -e

./scripts/workflow.sh --step build 2>&1 | tee build-output.log &
BUILD_PID=$!

echo "Started build pid=$BUILD_PID"

BUILD_DIR=""
# wait up to 300s for the build directory to appear
for i in {1..300}; do
  CANDIDATE=$(ls -d /private/var/folders/*/*/T/eas-build-local-nodejs/* 2>/dev/null | head -n1 || true)
  if [ -n "$CANDIDATE" ]; then
    if [ -d "$CANDIDATE/build" ]; then
      BUILD_DIR="$CANDIDATE/build"
      echo "FOUND_BUILD_DIR: $BUILD_DIR"
      break
    fi
  fi
  sleep 1
done

if [ -z "$BUILD_DIR" ]; then
  echo "No build dir found; waiting for build to finish and printing log"
  wait $BUILD_PID
  exit 1
fi

echo "--- babel.config.js (if present) ---"
if [ -f "$BUILD_DIR/babel.config.js" ]; then sed -n '1,200p' "$BUILD_DIR/babel.config.js"; else echo "MISSING"; fi

echo "--- package.json (top) ---"
if [ -f "$BUILD_DIR/package.json" ]; then sed -n '1,200p' "$BUILD_DIR/package.json"; else echo "MISSING"; fi

# Wait up to 600s for node_modules to appear, or print progress from build-output.log
for i in {1..600}; do
  if [ -d "$BUILD_DIR/node_modules" ]; then
    echo "node_modules present in build copy"
    ls -la "$BUILD_DIR/node_modules" | sed -n '1,200p'
    if [ -d "$BUILD_DIR/node_modules/babel-plugin-module-resolver" ]; then
      echo "PLUGIN_PRESENT: babel-plugin-module-resolver found"
      ls -la "$BUILD_DIR/node_modules/babel-plugin-module-resolver" | sed -n '1,200p'
    else
      echo "PLUGIN_MISSING: babel-plugin-module-resolver not found"
    fi
    break
  fi
  # print recent bundler lines for visibility
  if [ -f build-output.log ]; then
    tail -n 200 build-output.log | sed -n '1,200p'
  fi
  sleep 1
done

# After node_modules presence (or timeout), continue to tail the log until build finishes
echo "--- final log tail (last 400 lines) ---"
if [ -f build-output.log ]; then tail -n 400 build-output.log | sed -n '1,400p'; fi

wait $BUILD_PID
