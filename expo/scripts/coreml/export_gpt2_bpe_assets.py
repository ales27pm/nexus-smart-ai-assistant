#!/usr/bin/env python3
"""Export GPT-2 BPE assets (vocab.json + merges.txt) from a tokenizer.json."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Iterable, List


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export vocab.json and merges.txt from Hugging Face tokenizer.json",
    )
    parser.add_argument("--tokenizer-json", required=True, help="Path to tokenizer.json")
    parser.add_argument("--out-vocab", required=True, help="Output path for vocab.json")
    parser.add_argument("--out-merges", required=True, help="Output path for merges.txt")
    return parser.parse_args()


def normalize_merges(raw_merges: Iterable[object]) -> List[str]:
    lines: List[str] = []
    for idx, entry in enumerate(raw_merges):
        if isinstance(entry, str):
            line = entry.strip()
            if line:
                lines.append(line)
            continue

        if (
            isinstance(entry, list)
            and len(entry) == 2
            and isinstance(entry[0], str)
            and isinstance(entry[1], str)
        ):
            lines.append(f"{entry[0]} {entry[1]}")
            continue

        raise ValueError(f"Unsupported merge entry at index {idx}: {entry!r}")

    return lines



def merge_added_tokens(vocab: dict[str, object], raw_added_tokens: object) -> dict[str, int]:
    merged: dict[str, int] = {}
    for token, token_id in vocab.items():
        if not isinstance(token, str) or not isinstance(token_id, int):
            raise ValueError(f"Unsupported vocab entry: {token!r} -> {token_id!r}")
        merged[token] = token_id

    if raw_added_tokens is None:
        return merged

    if not isinstance(raw_added_tokens, list):
        raise ValueError("tokenizer.json added_tokens must be a list when present")

    for idx, entry in enumerate(raw_added_tokens):
        if not isinstance(entry, dict):
            raise ValueError(f"Unsupported added_tokens entry at index {idx}: {entry!r}")

        token = entry.get("content")
        token_id = entry.get("id")
        if not isinstance(token, str) or not isinstance(token_id, int):
            raise ValueError(
                f"added_tokens[{idx}] must include string content and integer id",
            )

        existing_id = merged.get(token)
        if existing_id is not None and existing_id != token_id:
            raise ValueError(
                f"Token {token!r} has conflicting ids: vocab={existing_id}, added={token_id}",
            )

        merged[token] = token_id

    return merged

def main() -> int:
    args = parse_args()
    tokenizer_path = Path(args.tokenizer_json)
    out_vocab = Path(args.out_vocab)
    out_merges = Path(args.out_merges)

    if not tokenizer_path.is_file():
        print(f"❌ tokenizer.json not found: {tokenizer_path}", file=sys.stderr)
        return 2

    with tokenizer_path.open("r", encoding="utf-8") as f:
        root = json.load(f)

    model = root.get("model")
    if not isinstance(model, dict):
        print("❌ tokenizer.json missing 'model' object", file=sys.stderr)
        return 3

    model_type = model.get("type")
    if model_type != "BPE":
        print(
            f"❌ Unsupported tokenizer model type '{model_type}'. Expected 'BPE'.",
            file=sys.stderr,
        )
        return 4

    vocab = model.get("vocab")
    if not isinstance(vocab, dict) or not vocab:
        print("❌ tokenizer.json model.vocab is missing or invalid", file=sys.stderr)
        return 5

    try:
        vocab = merge_added_tokens(vocab, root.get("added_tokens"))
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 8

    merges_raw = model.get("merges")
    if not isinstance(merges_raw, list) or not merges_raw:
        print("❌ tokenizer.json model.merges is missing or invalid", file=sys.stderr)
        return 6

    merges = normalize_merges(merges_raw)
    if not merges:
        print("❌ No usable merges were found in tokenizer.json", file=sys.stderr)
        return 7

    out_vocab.parent.mkdir(parents=True, exist_ok=True)
    out_merges.parent.mkdir(parents=True, exist_ok=True)

    with out_vocab.open("w", encoding="utf-8") as f:
        json.dump(vocab, f, ensure_ascii=False, separators=(",", ":"))

    with out_merges.open("w", encoding="utf-8") as f:
        f.write("#version: 0.2\n")
        for line in merges:
            f.write(line)
            f.write("\n")

    print(f"✓ Wrote vocab.json ({len(vocab)} entries) -> {out_vocab}")
    print(f"✓ Wrote merges.txt ({len(merges)} entries) -> {out_merges}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
