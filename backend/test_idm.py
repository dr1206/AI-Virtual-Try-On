"""Direct IDM-VTON test - Gradio Client to yisol/IDM-VTON, no FastAPI.

This is the isolation test: if it fails, the problem is in the remote
IDM-VTON Space, not in the Chrome extension or in main.py.

All paths are absolute, resolved from this file, so the script works
from any working directory.

Usage:
    python backend/test_idm.py

If the test images are missing, the script prints the exact paths it
looked for and how to create them, and exits without a traceback.
"""

from __future__ import annotations

import sys
import traceback
from pathlib import Path

from gradio_client import Client, handle_file
from huggingface_hub import get_token

BASE_DIR = Path(__file__).resolve().parent
IMAGE_DIR = BASE_DIR / "test_images"
HUMAN = IMAGE_DIR / "known_human.jpg"
GARMENT = IMAGE_DIR / "known_garment.jpg"
MAKER = BASE_DIR / "make_test_images.py"

SPACE = "yisol/IDM-VTON"
GARMENT_DESCRIPTION = "shirt"


def banner(text: str) -> None:
    print()
    print("=" * 60)
    print(text)
    print("=" * 60)


def fail(message: str) -> int:
    print()
    print(message)
    return 2


def check_images() -> int:
    """Report exactly what is missing instead of raising."""
    print("Human image :", HUMAN)
    print("Garment     :", GARMENT)

    missing = [p for p in (HUMAN, GARMENT) if not p.exists()]

    if not missing:
        return 0

    print()
    print("MISSING TEST IMAGES:")
    for path in missing:
        print("  -", path)
    print()
    print("Create simple placeholders automatically with:")
    print("    python", MAKER)
    print()
    print("Or drop your own files into:")
    print("   ", IMAGE_DIR)
    print()
    print("Naming: profile.png (a person) and garment.png (a garment).")
    return 2


def main() -> int:
    banner("IDM-VTON DIRECT API TEST (no FastAPI)")

    print("Space       :", SPACE)
    print("Script dir  :", BASE_DIR)

    missing_code = check_images()

    if missing_code:
        return missing_code

    token = get_token()

    if not token:
        return fail(
            "No Hugging Face token found.\n"
            "Authenticate with:  hf auth login"
        )

    print("Token       : found (value never printed)")

    banner("CONNECTING")

    try:
        client = Client(SPACE, token=token)

    except Exception:
        print("Could not connect to the Space:")
        traceback.print_exc()
        return 1

    print("Connected to", SPACE)

    banner("CALLING /tryon")

    # Argument order verified against the live Space:
    #   predict(dict, garm_img, garment_des, is_checked,
    #           is_checked_crop, denoise_steps, seed)
    # Category is application-level only and is NOT an API argument.
    try:
        result = client.predict(
            {
                "background": handle_file(str(HUMAN)),
                "layers": [],
                "composite": None,
            },
            handle_file(str(GARMENT)),
            GARMENT_DESCRIPTION,
            True,   # is_checked      - auto mask
            False,  # is_checked_crop - no auto crop
            30,     # denoise_steps
            42,     # seed
            api_name="/tryon",
        )

    except Exception as exc:
        banner("UPSTREAM CALL FAILED")
        print("Exception type :", type(exc).__name__)
        print("Message        :", exc)
        print()

        lowered = str(exc).lower()
        quota = any(
            k in lowered
            for k in ("zerogpu", "quota", "exceeded your free")
        )

        if quota:
            print("DIAGNOSIS: the remote IDM-VTON Space refused the "
                  "request because the free ZeroGPU inference quota is "
                  "exhausted.")
            print("This is a hosting quota limit, not a bug in this "
                  "project and not a problem with the extension.")
            print("It clears automatically when the quota window "
                  "resets - retry later.")
        else:
            print("DIAGNOSIS: the failure is inside the remote IDM-VTON "
                  "Space, not in this project.")
            print("Re-run python backend/diagnose_idm.py for the "
                  "isolated diagnostic.")

        return 1

    banner("SUCCESS")
    print("Complete result:")
    print(result)
    print()
    print("Result type:", type(result).__name__)

    if isinstance(result, (list, tuple)):
        if len(result) > 0:
            print()
            print("Generated image:", result[0])
        if len(result) > 1:
            print("Masked image   :", result[1])
    else:
        print()
        print("Generated image:", result)

    return 0


if __name__ == "__main__":
    sys.exit(main())
