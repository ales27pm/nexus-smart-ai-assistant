#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 1 ]]; then
  echo "Usage: scripts/coreml/resolve_model_sha256.sh <url> [url...]" >&2
  exit 1
fi

for url in "$@"; do
  tmp_file="$(mktemp)"
  if ! curl -fL --retry 3 --retry-delay 2 --connect-timeout 30 "$url" -o "$tmp_file"; then
    echo -e "ERROR\t$url\tfailed to download" >&2
    rm -f "$tmp_file"
    continue
  fi

  bytes="$(wc -c < "$tmp_file" | tr -d ' ')"
  sha="$(shasum -a 256 "$tmp_file" | awk '{print $1}')"
  echo -e "${sha}\t${bytes}\t${url}"
  rm -f "$tmp_file"
done
