"""Draws the app icon (four bars in the shape of the wave) as PNGs using only the standard library.

Run from the project root: python tools/make_icons.py
"""
import struct
import zlib
from pathlib import Path

NAVY = (0x14, 0x20, 0x2E)
CHALK = (0xEE, 0xF1, 0xF4)
STEEL = (0x4F, 0x6A, 0x86)

# Week intensities from the template; the deload bar is drawn in steel.
WAVE = [0.70, 0.75, 0.825, 0.50]


def bar_height(pct):
    # Same exaggeration as the in-app wave so 70% and 75% read as different heights.
    return 110 + (pct - 0.5) / 0.325 * 190


def rects():
    """Shapes in a 512-unit square: (x0, y0, x1, y1, colour)."""
    width, gap = 72, 36
    left = (512 - (4 * width + 3 * gap)) // 2
    base = 392
    shapes = []
    for i, pct in enumerate(WAVE):
        x0 = left + i * (width + gap)
        shapes.append((x0, base - bar_height(pct), x0 + width, base, STEEL if i == 3 else CHALK))
    shapes.append((left, base + 14, 512 - left, base + 24, STEEL))
    return shapes


def draw(size):
    scale = size / 512
    pixels = [[NAVY] * size for _ in range(size)]
    for x0, y0, x1, y1, colour in rects():
        for y in range(round(y0 * scale), round(y1 * scale)):
            row = pixels[y]
            for x in range(round(x0 * scale), round(x1 * scale)):
                row[x] = colour
    return pixels


def png(pixels):
    size = len(pixels)
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in pixels)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
        (out / name).write_bytes(png(draw(size)))
        print(f"wrote icons/{name}")
