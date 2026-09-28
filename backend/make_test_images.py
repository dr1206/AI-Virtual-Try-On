"""Creates simple offline test fixtures so the IDM-VTON test can run.

These are synthetic placeholders used only to verify connectivity to
the hosted Space. Replace them with real photos of a person and a
garment for a meaningful quality check.
"""

from pathlib import Path

from PIL import Image, ImageDraw

BASE_DIR = Path(__file__).resolve().parent
OUT_DIR = BASE_DIR / "test_images"


def make_human(path: Path) -> None:
    # A simple front-facing figure: head, neck, torso and legs on a
    # plain background.
    img = Image.new("RGB", (768, 1024), (238, 238, 240))
    d = ImageDraw.Draw(img)

    # Head and neck.
    d.ellipse([314, 90, 454, 230], fill=(226, 178, 145))
    d.rectangle([364, 220, 404, 280], fill=(214, 163, 130))

    # Torso.
    d.polygon(
        [(250, 280), (518, 280), (556, 640), (212, 640)],
        fill=(92, 104, 140)
    )

    # Arms.
    d.rectangle([206, 285, 252, 660], fill=(92, 104, 140))
    d.rectangle([516, 285, 562, 660], fill=(92, 104, 140))
    d.ellipse([206, 640, 252, 700], fill=(226, 178, 145))
    d.ellipse([516, 640, 562, 700], fill=(226, 178, 145))

    # Legs.
    d.rectangle([268, 640, 372, 990], fill=(58, 62, 84))
    d.rectangle([396, 640, 500, 990], fill=(58, 62, 84))

    img.save(path)


def make_garment(path: Path) -> None:
    # A solid red shirt on a flat white background.
    img = Image.new("RGB", (768, 1024), (255, 255, 255))
    d = ImageDraw.Draw(img)

    d.polygon(
        [(250, 200), (518, 200), (556, 560), (212, 560)],
        fill=(196, 30, 38)
    )
    d.polygon([(250, 200), (150, 300), (206, 380), (250, 320)],
              fill=(196, 30, 38))
    d.polygon([(518, 200), (618, 300), (562, 380), (518, 320)],
              fill=(196, 30, 38))
    d.rectangle([206, 540, 562, 600], fill=(160, 20, 28))

    img.save(path)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    human = OUT_DIR / "profile.png"
    garment = OUT_DIR / "garment.png"

    make_human(human)
    make_garment(garment)

    print("Created test fixtures:")
    print(" ", human)
    print(" ", garment)


if __name__ == "__main__":
    main()
