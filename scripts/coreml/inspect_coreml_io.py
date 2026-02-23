#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def _shape_from_type(arr_type):
    shape = []
    if hasattr(arr_type, "shape"):
        shape = [int(x) for x in arr_type.shape]
    return shape


def _dump_feature(feature):
    kind = feature.type.WhichOneof("Type")
    out = {"name": feature.name, "type": kind}
    if kind == "multiArrayType":
      arr = feature.type.multiArrayType
      out["dataType"] = int(arr.dataType)
      out["shape"] = _shape_from_type(arr)
    return out


def _state_list(desc):
    states = []
    if hasattr(desc, "state"):
        for s in desc.state:
            states.append({"name": s.name, "type": s.type.WhichOneof("Type")})
    return states


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/coreml/inspect_coreml_io.py <model.mlpackage|model.mlmodelc>")
        sys.exit(2)

    model_path = Path(sys.argv[1]).expanduser().resolve()
    if not model_path.exists():
        print(f"Path not found: {model_path}", file=sys.stderr)
        sys.exit(1)

    import coremltools as ct

    spec = ct.utils.load_spec(str(model_path))
    desc = spec.description

    out = {
        "model_type": spec.WhichOneof("Type"),
        "inputs": [_dump_feature(i) for i in desc.input],
        "outputs": [_dump_feature(o) for o in desc.output],
        "states": _state_list(desc),
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
