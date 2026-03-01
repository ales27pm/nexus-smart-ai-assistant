#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description="Inspect CoreML model inputs/outputs (mlpackage).")
    ap.add_argument("model_path", help="Path to .mlpackage or .mlmodel")
    ap.add_argument("--expect-input", action="append", default=[], help="Expected input feature name (repeatable)")
    ap.add_argument("--expect-output", action="append", default=[], help="Expected output feature name (repeatable)")
    ap.add_argument("--expect-state", action="append", default=[], help="Expected state feature name (repeatable, iOS 18+ models)")
    ap.add_argument("--strict", action="store_true", help="Exit non-zero when any expectation is missing")
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
    input_names = [i.name for i in desc.input]
    output_names = [o.name for o in desc.output]

    state_names = []
    if hasattr(desc, "state"):
        state_names = [s.name for s in desc.state]

    out = {
        "model_type": "mlProgram" if spec.WhichOneof("Type") == "mlProgram" else spec.WhichOneof("Type"),
        "inputs": [],
        "outputs": [],
        "states": [],
        "metadata": {
            "shortDescription": getattr(desc, "shortDescription", ""),
            "versionString": getattr(desc, "versionString", ""),
        },
        "names": {
            "inputs": input_names,
            "outputs": output_names,
            "states": state_names,
        },
        "expectationResults": {
            "missingInputs": [x for x in args.expect_input if x not in input_names],
            "missingOutputs": [x for x in args.expect_output if x not in output_names],
            "missingStates": [x for x in args.expect_state if x not in state_names],
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

    if hasattr(desc, "state"):
        for st in desc.state:
            entry = {"name": st.name}
            t = st.type.WhichOneof("Type")
            entry["type"] = t
            if t == "multiArrayType":
                mat = st.type.multiArrayType
                entry["shape"] = list(mat.shape) if len(mat.shape) else []
                entry["dataType"] = str(mat.dataType)
            out["states"].append(entry)

    print(json.dumps(out, indent=2))

    if args.strict:
        missing = (
            out["expectationResults"]["missingInputs"]
            + out["expectationResults"]["missingOutputs"]
            + out["expectationResults"]["missingStates"]
        )
        if missing:
            print("❌ CoreML IO expectation mismatch", file=sys.stderr)
            sys.exit(2)


if __name__ == "__main__":
    main()
