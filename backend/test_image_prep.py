"""Verifies backend/image_input_prep.py against every input shape.

No network and no model call: every input is generated locally with
Pillow, including a real AVIF, and the checks confirm that

  * a plain PNG or JPEG is passed through byte for byte, so the sites
    that already work cannot be affected, and
  * anything else the CDN might deliver (AVIF, WebP, an HTML error
    page, a truncated or empty body) is either converted into a PNG
    or rejected outright.

Run: python backend/test_image_prep.py
"""

import os
import sys
import tempfile
from pathlib import Path

from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from image_input_prep import (  # noqa: E402
    ImageNotUsable,
    prepare_input_image as _prepare_input_image
)

WORK = Path(tempfile.mkdtemp(prefix="image_prep_test_"))

# Any file the module produces while converting, so the test cleans up
# after itself as thoroughly as the endpoint does.
PRODUCED = []


def prepare_input_image(path, label="test"):
    """Call the module and record any converted file it writes."""

    result = _prepare_input_image(path, label)

    if result != path:
        PRODUCED.append(result)

    return result


passed = 0
failed = 0


def check(label, condition, detail=""):
    """Record one assertion."""

    global passed, failed

    if condition:
        passed += 1
        print(f"PASS  {label}")
    else:
        failed += 1
        print(f"FAIL  {label} {detail}")


def sample_image():
    """A small deterministic RGB image."""

    return Image.new("RGB", (64, 48), (200, 30, 40))


def write(name, image_format):
    """Save the sample image in the given format and return the path."""

    path = WORK / name
    sample_image().save(path, format=image_format)
    return str(path)


print("=" * 60)
print("IMAGE INPUT PREPARATION")
print("=" * 60)

# ------------------------------------------------------------
# Formats that must pass through untouched
# ------------------------------------------------------------

for name, image_format in (
    ("profile.png", "PNG"),
    ("garment.jpg", "JPEG"),
):
    path = write(name, image_format)
    before = Path(path).read_bytes()

    result = prepare_input_image(path, "test")

    check(
        f"{image_format} passes through unchanged",
        result == path and Path(result).read_bytes() == before,
        f"(returned {result})"
    )

# ------------------------------------------------------------
# Formats that must be converted
# ------------------------------------------------------------

for name, image_format in (
    ("garment.avif", "AVIF"),
    ("garment.webp", "WEBP"),
    ("garment.bmp", "BMP"),
    ("garment.gif", "GIF"),
):
    try:
        path = write(name, image_format)

    except Exception as error:
        check(f"{image_format} sample could be written", False, str(error))
        continue

    result = prepare_input_image(path, "test")

    converted = result != path

    with Image.open(result) as produced:
        usable = produced.format == "PNG" and produced.size == (64, 48)

    check(
        f"{image_format} is normalised into a readable PNG",
        converted and usable,
        f"(-> {result})"
    )

# ------------------------------------------------------------
# The exact defect: AVIF bytes inside a file named .png
# ------------------------------------------------------------

misnamed = WORK / "garment_misnamed_as.png"
sample_image().save(misnamed, format="AVIF")

result = prepare_input_image(str(misnamed), "test")

with Image.open(result) as produced:
    fixed = produced.format == "PNG" and produced.size == (64, 48)

check(
    "AVIF named .png is detected by content and normalised",
    result != str(misnamed) and fixed
)

# ------------------------------------------------------------
# Bodies that are not images at all must be rejected
# ------------------------------------------------------------

not_an_image = WORK / "error_page.jpg"
not_an_image.write_bytes(
    b"<!doctype html><html><body>403 Forbidden</body></html>"
)

try:
    prepare_input_image(str(not_an_image), "test")
    check("an HTML error page is rejected", False, "(it was accepted)")

except ImageNotUsable as error:
    check("an HTML error page is rejected", True)

empty = WORK / "empty.png"
empty.write_bytes(b"")

try:
    prepare_input_image(str(empty), "test")
    check("an empty file is rejected", False, "(it was accepted)")

except ImageNotUsable:
    check("an empty file is rejected", True)

# A truncated file must never be handed onwards in a broken state: it
# is either rejected, or the re-encode produced a fully valid image.
truncated = WORK / "truncated.jpg"
whole_bytes = Path(write("whole_truncate_source.jpg", "JPEG")).read_bytes()
truncated.write_bytes(whole_bytes[:400])

try:
    result = prepare_input_image(str(truncated), "test")

    with Image.open(result) as produced:
        produced.load()

    check("a truncated JPEG never yields a broken file", True)

except ImageNotUsable:
    check("a truncated JPEG never yields a broken file", True)

try:
    prepare_input_image(str(WORK / "does_not_exist.png"), "test")
    check("a missing file is rejected", False, "(it was accepted)")

except ImageNotUsable:
    check("a missing file is rejected", True)

# ------------------------------------------------------------
# Cleanup
# ------------------------------------------------------------

for entry in WORK.iterdir():
    try:
        os.remove(entry)
    except Exception:
        pass

try:
    os.rmdir(WORK)
except Exception:
    pass

# Remove any converted file the module wrote outside the work folder.
for produced in PRODUCED:
    try:
        os.remove(produced)
    except Exception:
        pass

print()
print("=" * 60)
print(f"{passed}/{passed + failed} checks passed.")
print("=" * 60)

if failed:
    raise SystemExit(1)
