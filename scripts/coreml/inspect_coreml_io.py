#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def _shape_from_multiarray(ma):
    # ma.shape is repeated int64; flexible shapes appear elsewhere.
    try:
        return list(ma.shape)
    except Exception:  # noqa: BLE001 - best-effort shape probe from CoreML proto
        return []


def _feature_type(ft):
    which = ft.WhichOneof("Type")
    if which is None:
        return "unknown"
    if which == "multiArrayType":
        return "multiArrayType"
    return which


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: inspect_coreml_io.py /path/to/model.mlpackage", file=sys.stderr)
        return 2

    model_path = Path(sys.argv[1]).expanduser().resolve()
    if not model_path.exists():
        print(f"❌ Not found: {model_path}", file=sys.stderr)
        return 3

    try:
        import coremltools as ct
    except Exception as e:  # noqa: BLE001 - dependency import may fail in non-CoreML envs
        print("❌ Missing dependency: coremltools", file=sys.stderr)
        print("   Install: python3 -m pip install -U coremltools", file=sys.stderr)
        print(f"   Import error: {e}", file=sys.stderr)
        return 4

    try:
        spec = ct.utils.load_spec(str(model_path))
    except Exception as e:  # noqa: BLE001 - model parsing raises backend-specific exceptions
        print("❌ Failed to load CoreML model.", file=sys.stderr)
        print(f"   Path: {model_path}", file=sys.stderr)
        print(f"   Error: {e}", file=sys.stderr)
        return 5

    desc = spec.description

    out = {
        "model_type": spec.WhichOneof("Type"),
        "inputs": [],
        "outputs": [],
        "metadata": {
            "shortDescription": getattr(desc, "shortDescription", ""),
            "versionString": getattr(desc, "versionString", ""),
        },
    }

    for f in desc.input:
        t = _feature_type(f.type)
        entry = {"name": f.name, "type": t, "shape": []}
        if t == "multiArrayType":
            entry["shape"] = _shape_from_multiarray(f.type.multiArrayType)
        out["inputs"].append(entry)

    for f in desc.output:
        t = _feature_type(f.type)
        entry = {"name": f.name, "type": t, "shape": []}
        if t == "multiArrayType":
            entry["shape"] = _shape_from_multiarray(f.type.multiArrayType)
        out["outputs"].append(entry)

    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
