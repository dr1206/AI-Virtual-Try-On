"""Minimal IDM-VTON connectivity diagnostic.

Runs ONLY:
    Client connection
    -> upload human image
    -> upload garment image
    -> /tryon
    -> print result

It does not import or touch main.py, so it cannot be affected by
FastAPI, and it tells us whether a failure happens in the remote
IDM-VTON Space or in our own code.

Usage:
    python backend/diagnose_idm.py
"""

from __future__ import annotations

import traceback
from pathlib import Path

from gradio_client import Client, handle_file
from huggingface_hub import get_token

BASE_DIR = Path(__file__).resolve().parent
IMAGE_DIR = BASE_DIR / "test_images"
HUMAN = IMAGE_DIR / "profile.png"
GARMENT = IMAGE_DIR / "garment.png"
SPACE = "yisol/IDM-VTON"


def banner(text: str) -> None:
    print()
    print("=" * 60)
    print(text)
    print("=" * 60)


def main() -> int:
    banner("IDM-VTON MINIMAL DIAGNOSTIC")

    print("Space       :", SPACE)
    print("Human image :", HUMAN)
    print("Garment     :", GARMENT)

    missing = [p for p in (HUMAN, GARMENT) if not p.exists()]

    if missing:
        print()
        print("MISSING TEST IMAGES:")
        for path in missing:
            print("  -", path)
        print()
        print("Create them with:  python backend/make_test_images.py")
        return 2

    token = get_token()

    if not token:
        print()
        print("No Hugging Face token. Run: hf auth login")
        return 2

    print("Token       : found (value not printed)")

    try:
        client = Client(SPACE, token=token)
    except Exception:
        banner("FAILED: could not connect to the Space")
        traceback.print_exc()
        return 1

    print("Connected   : ok")

    # Confirm the live signature before calling it.
    try:
        info = client.view_api(return_format="dict")
        endpoints = info.get("named_endpoints", {})
        print()
        print("Live /tryon parameters:")
        for param in endpoints.get("/tryon", {}).get("parameters", []):
            print("  ", param.get("parameter_name"),
                  ":", param.get("python_type", {}).get("type"))
    except Exception:
        print("view_api    : unavailable (continuing anyway)")

    banner("CALLING /tryon")

    try:
        result = client.predict(
            {
                "background": handle_file(str(HUMAN)),
                "layers": [],
                "composite": None,
            },
            handle_file(str(GARMENT)),
            "shirt",
            True,
            False,
            30,
            42,
            api_name="/tryon",
        )
    except Exception as exc:
        banner("UPSTREAM CALL FAILED")
        print("Exception type :", type(exc).__name__)
        print("Exception repr :", repr(exc))
        print()
        print("Message:")
        print(exc)
        print()
        print("Quota-related text present:",
              any(k in str(exc).lower()
                  for k in ("zerogpu", "quota", "exceeded your free")))
        return 1

    banner("CALL SUCCEEDED")
    print("Result type:", type(result))
    print("Result     :", result)

    if isinstance(result, (list, tuple)):
        if len(result) > 0:
            print()
            print("Generated image:", result[0])
        if len(result) > 1:
            print("Masked image   :", result[1])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
