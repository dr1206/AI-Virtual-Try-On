"""
Print the live IDM-VTON /tryon API schema.

Read-only: it only fetches the Space API description, it does NOT
run inference and does NOT consume any GPU quota.

Why this exists
---------------
The generated result showed a stock studio model instead of the
user's profile photo. The client-side payload looked correct, so the
remaining question is what the Space actually expects for the
ImageEditor argument. This prints the authoritative schema.
"""

import json
import os
import sys

from gradio_client import Client
from huggingface_hub import get_token

SPACE = os.environ.get(
    "IDM_VTON_SPACE",
    "yisol/IDM-VTON",
)


def main():
    token = get_token()

    client = Client(
        SPACE,
        token=token,
        verbose=False,
    )

    info = client.view_api(
        return_format="dict",
        print_info=False,
    )

    print("=" * 60)
    print("NAMED ENDPOINT: /tryon")
    print("=" * 60)

    named = info.get("named_endpoints", {})

    tryon = named.get("/tryon")

    if not tryon:
        print("No /tryon endpoint found. Available:")
        for key in named:
            print(" -", key)
        return 1

    print("RETURN TYPES:")
    print(json.dumps(
        tryon.get("returns"),
        indent=2
    ))

    print()
    print("=" * 60)
    print("PARAMETERS")
    print("=" * 60)

    for param in tryon.get("parameters", []):
        print()
        print("NAME :", param.get("parameter_name"))
        print("LABEL:", param.get("label"))
        print("DEFAULT:", json.dumps(
            param.get("value", {}).get("default")
        ))
        print("TYPE :", param.get("type", {}).get("type"))
        print("COMPONENT:", param.get("type", {}).get("component"))

        print("SCHEMA:")
        print(json.dumps(
            param.get("type"),
            indent=2
        )[:2000])

    return 0


if __name__ == "__main__":
    sys.exit(main())
