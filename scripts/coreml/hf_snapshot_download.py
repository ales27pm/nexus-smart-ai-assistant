#!/usr/bin/env python3
import argparse
import os
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description="Download a subdirectory snapshot from a Hugging Face repo.")
    ap.add_argument("--repo", required=True, help="Repo id, e.g. ales27pm/Dolphin3.0-CoreML")
    ap.add_argument(
        "--subdir",
        required=True,
        help="Subdir to download, e.g. Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage",
    )
    ap.add_argument("--out", required=True, help="Local directory to place files into")
    ap.add_argument("--token", default=None, help="HF token if needed")
    args = ap.parse_args()

    try:
        from huggingface_hub import snapshot_download
    except Exception as e:
        print("❌ Missing dependency: huggingface_hub", file=sys.stderr)
        print("   Install: python3 -m pip install -U huggingface_hub", file=sys.stderr)
        print(f"   Import error: {e}", file=sys.stderr)
        return 1

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    # IMPORTANT: huggingface_hub uses fnmatch; '*' matches '/' too in practice here.
    # We allow only the selected mlpackage folder.
    allow = [f"{args.subdir}/*"]

    print(f"[i] snapshot_download repo={args.repo}")
    print(f"[i] allow_patterns={allow}")
    print(f"[i] local_dir={out_dir}")

    snapshot_download(
        repo_id=args.repo,
        local_dir=str(out_dir),
        local_dir_use_symlinks=False,
        allow_patterns=allow,
        token=args.token or os.environ.get("HF_TOKEN"),
        resume_download=True,
        max_workers=8,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
