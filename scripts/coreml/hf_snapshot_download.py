#!/usr/bin/env python3
import argparse
import os
import sys
from pathlib import Path

def main():
    ap = argparse.ArgumentParser(description="Download a subset of a HF repo via snapshot_download (no hf CLI needed).")
    ap.add_argument("--repo", required=True, help="Repo id, e.g. ales27pm/Dolphin3.0-CoreML")
    ap.add_argument("--local-dir", required=True, help="Destination directory for HF snapshot")
    ap.add_argument("--allow-pattern", action="append", default=[], help="Repeatable allow_patterns glob(s)")
    ap.add_argument("--revision", default=None, help="Optional revision/commit/tag")
    ap.add_argument("--token-env", default="HF_TOKEN", help="Env var holding HF token (optional)")
    args = ap.parse_args()

    try:
        from huggingface_hub import snapshot_download
    except Exception as e:
        print("❌ Missing huggingface_hub. Install with:", file=sys.stderr)
        print("   python3 -m pip install --upgrade huggingface_hub", file=sys.stderr)
        raise

    token = os.environ.get(args.token_env) or None

    local_dir = Path(args.local_dir).expanduser().resolve()
    local_dir.mkdir(parents=True, exist_ok=True)

    allow_patterns = args.allow_pattern or None
    print(f"[i] snapshot_download repo={args.repo}")
    if args.revision:
        print(f"[i] revision={args.revision}")
    if allow_patterns:
        print(f"[i] allow_patterns={allow_patterns}")
    print(f"[i] local_dir={local_dir}")
    if not token:
        print("[!] No HF token detected (HF_TOKEN). You may get rate-limited on large downloads.", file=sys.stderr)

    snapshot_path = snapshot_download(
        repo_id=args.repo,
        local_dir=str(local_dir),
        allow_patterns=allow_patterns,
        revision=args.revision,
        token=token,
    )

    print(f"[✓] Done. Snapshot at: {snapshot_path}")

if __name__ == "__main__":
    main()
