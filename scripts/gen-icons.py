"""
Render public/icon-192.png and public/icon-512.png at native pixel
resolution. Each canvas size gets its own integer-pixel layout — the
spine bars are sized as proportions of the canvas and rounded to ints
so edges land exactly on pixel boundaries.

Layout: navy ground, four book-spine bars (gold / blue / red / gray)
centered on the canvas with descending heights. 25% rounded corners
on the tile so the icon matches the sidebar logo and the OS maskable
safe zone.

Run: `python scripts/gen-icons.py`
"""

from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw

NAVY = (0x1B, 0x3A, 0x5C)
GOLD = (0xC4, 0xA3, 0x5A)
BLUE = (0x5B, 0x8D, 0xB8)
RED = (0xB8, 0x32, 0x32)
GRAY = (0x8A, 0x8A, 0xA4)

# Bar (color, height_fraction of canvas). Tallest first.
BARS: list[tuple[tuple[int, int, int], float]] = [
    (GOLD, 290 / 512),
    (BLUE, 250 / 512),
    (RED,  210 / 512),
    (GRAY, 170 / 512),
]

BAR_WIDTH_FRAC = 50 / 512
BAR_GAP_FRAC = 16 / 512
CORNER_RADIUS_FRAC = 0.25
BAR_RADIUS_FRAC = 6 / 512


def render(canvas: int, out: Path) -> None:
    """Draw a navy + spine-stack icon at exactly canvas x canvas pixels."""
    bar_w = max(1, round(canvas * BAR_WIDTH_FRAC))
    gap = max(1, round(canvas * BAR_GAP_FRAC))
    total_w = bar_w * len(BARS) + gap * (len(BARS) - 1)
    start_x = (canvas - total_w) // 2
    bar_radius = max(1, round(canvas * BAR_RADIUS_FRAC))

    img = Image.new("RGBA", (canvas, canvas), NAVY + (255,))
    draw = ImageDraw.Draw(img)

    for i, (color, h_frac) in enumerate(BARS):
        h = max(1, round(canvas * h_frac))
        x = start_x + i * (bar_w + gap)
        y = (canvas - h) // 2
        draw.rounded_rectangle(
            (x, y, x + bar_w - 1, y + h - 1),
            radius=bar_radius,
            fill=color + (255,),
        )

    radius = round(canvas * CORNER_RADIUS_FRAC)
    mask = Image.new("L", (canvas, canvas), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, canvas - 1, canvas - 1), radius=radius, fill=255
    )
    out_img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out_img.paste(img, mask=mask)

    out.parent.mkdir(parents=True, exist_ok=True)
    out_img.save(out, format="PNG", optimize=True)
    print(f"  wrote {out} ({canvas}x{canvas})")


def main() -> None:
    here = Path(__file__).resolve().parent.parent
    public = here / "public"
    print("Rendering Carnegie spine-stack icons:")
    render(192, public / "icon-192.png")
    render(512, public / "icon-512.png")


if __name__ == "__main__":
    main()
