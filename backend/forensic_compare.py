"""
Forensic check: is the person in a generated result one of the
IDM-VTON Space's built-in example photos?

IDM-VTON only repaints the masked garment region. The face, the
trousers and the plain backdrop come straight from the human image
that was sent as ImageEditor["background"]. So the bottom strip of a
result is essentially a copy of the human image, resized to 768x1024.

That makes it possible to identify the human image without running
any inference and without spending GPU quota: compare the bottom
strip of the result against every example photo shipped in the Space.

This reads local files and the already-downloaded examples only. It
never calls the Space API.
"""

import tempfile
from pathlib import Path

from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
RESULTS_DIR = BASE_DIR / "results"
EXAMPLES_DIR = Path(tempfile.gettempdir()) / "idm_examples"

# IDM-VTON resizes the human image to 768x1024 before inference.
TARGET_W = 768
TARGET_H = 1024

# Rows taken from the bottom: the garment never reaches here.
BOTTOM_START = int(TARGET_H * 0.78)


def bottom_strip(image: Image.Image) -> Image.Image:
    """Return the untouched lower band of the image, greyscaled."""
    resized = image.convert(
        "RGB"
    ).resize(
        (TARGET_W, TARGET_H)
    )

    return resized.crop(
        (0, BOTTOM_START, TARGET_W, TARGET_H)
    ).convert("L")


def mean_abs_diff(
    a: Image.Image,
    b: Image.Image
) -> float:
    """Mean absolute pixel difference between two equal-size images."""
    if a.size != b.size:
        return 999.0

    pa = list(a.getdata())
    pb = list(b.getdata())

    total = 0

    for x, y in zip(pa, pb):
        total += abs(x - y)

    return total / len(pa)


def main() -> int:
    results = sorted(
        RESULTS_DIR.glob("tryon_*.png")
    )

    if not results:
        print("No generated results found in", RESULTS_DIR)
        return 1

    if not EXAMPLES_DIR.is_dir():
        print("Examples not found at", EXAMPLES_DIR)
        return 1

    examples = sorted(
        EXAMPLES_DIR.iterdir()
    )

    for result_path in results:
        print()
        print("=" * 60)
        print("RESULT:", result_path.name)
        print("=" * 60)

        strip = bottom_strip(
            Image.open(result_path)
        )

        scores = []

        for example in examples:
            try:
                example_strip = bottom_strip(
                    Image.open(example)
                )

            except Exception as exc:
                print("  skip", example.name, exc)
                continue

            scores.append((
                mean_abs_diff(
                    strip, example_strip
                ),
                example.name
            ))

        scores.sort()

        print()
        print(
            "Bottom-strip mean absolute difference "
            "(lower = same photo):"
        )

        for score, name in scores:
            print(
                "   %7.2f  %s" % (score, name)
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
