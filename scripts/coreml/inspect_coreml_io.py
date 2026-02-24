#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

def _shape_to_list(shape):
    try:
        return [int(x) for x in shape]
    except Exception:
        return []

def main():
    ap = argparse.ArgumentParser(description="Inspect CoreML model inputs/outputs (mlpackage).")
    ap.add_argument("model_path", help="Path to .mlpackage or .mlmodel")
    args = ap.parse_args()

    p = Path(args.model_path).expanduser().resolve()
    if not p.exists():
        print(f"❌ Not found: {p}", file=sys.stderr)
        sys.exit(1)

    try:
        import coremltools as ct
    except Exception:
        print("❌ coremltools not installed. Install with:", file=sys.stderr)
        print("   python3 -m pip install --upgrade coremltools", file=sys.stderr)
        sys.exit(1)

    try:
        mlmodel = ct.models.MLModel(str(p))
        spec = mlmodel.get_spec()
    except Exception as e:
        print(f"❌ Failed to load model: {e}", file=sys.stderr)
        sys.exit(1)

    desc = spec.description
    out = {
        "model_type": "mlProgram" if spec.WhichOneof("Type") == "mlProgram" else spec.WhichOneof("Type"),
        "inputs": [],
        "outputs": [],
        "metadata": {
            "shortDescription": getattr(desc, "shortDescription", ""),
            "versionString": getattr(desc, "versionString", ""),
        },
    }

    for inp in desc.input:
        entry = {"name": inp.name}
        t = inp.type.WhichOneof("Type")
        entry["type"] = t
        if t == "multiArrayType":
            mat = inp.type.multiArrayType
            entry["shape"] = list(mat.shape) if len(mat.shape) else []
            entry["dataType"] = str(mat.dataType)
        out["inputs"].append(entry)

    for o in desc.output:
        entry = {"name": o.name}
        t = o.type.WhichOneof("Type")
        entry["type"] = t
        if t == "multiArrayType":
            mat = o.type.multiArrayType
            entry["shape"] = list(mat.shape) if len(mat.shape) else []
            entry["dataType"] = str(mat.dataType)
        out["outputs"].append(entry)

    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
