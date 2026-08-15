"""Генератор иконок приложения.

Рисует кольцевую диаграмму — тот же образ, что и на главном экране.
Зависимостей нет: PNG собирается вручную через zlib, сглаживание — суперсэмплингом.

Запуск:  python tools/generate_icons.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"

BACKGROUND = (0xF0, 0xF0, 0xF0)
TRACK = (0xEA, 0xEA, 0xEA)

# Сегменты кольца: (доля, цвет) — повторяют палитру категорий.
SEGMENTS = [
    (0.42, (0x77, 0x37, 0xE6)),
    (0.24, (0x17, 0x93, 0xDF)),
    (0.20, (0x30, 0xA0, 0x44)),
    (0.14, (0xFF, 0xC4, 0x63)),
]

SUPERSAMPLE = 4  # 4x4 выборки на пиксель


def write_png(path: Path, width: int, height: int, pixels: list[bytearray]) -> None:
    """pixels — список строк по width*4 байт (RGBA)."""
    raw = b"".join(b"\x00" + bytes(row) for row in pixels)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">2I5B", width, height, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def rounded_rect_contains(x: float, y: float, size: float, radius: float) -> bool:
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2


def segment_color(angle: float) -> tuple[int, int, int] | None:
    """Цвет дуги по углу (0 — сверху, по часовой). None — зазор между секторами."""
    total = sum(share for share, _ in SEGMENTS)
    position = 0.0
    fraction = angle / (2 * math.pi)
    gap = 0.008
    for share, color in SEGMENTS:
        end = position + share / total
        if position + gap / 2 <= fraction < end - gap / 2:
            return color
        position = end
    return None


def sample(x: float, y: float, size: float, *, maskable: bool) -> tuple[int, int, int, int]:
    """Цвет точки (x, y) в координатах иконки."""
    center = size / 2

    # Подложка
    if maskable:
        inside_bg = True
    else:
        inside_bg = rounded_rect_contains(x, y, size, size * 0.225)

    if not inside_bg:
        return (0, 0, 0, 0)

    ring_outer = size * (0.30 if maskable else 0.37)
    ring_inner = ring_outer - size * (0.085 if maskable else 0.105)

    dx, dy = x - center, y - center
    distance = math.hypot(dx, dy)

    if ring_inner <= distance <= ring_outer:
        # Угол от «12 часов» по часовой стрелке.
        angle = (math.atan2(dx, -dy)) % (2 * math.pi)
        color = segment_color(angle)
        return (*(color or TRACK), 255)

    return (*BACKGROUND, 255)


def render(size: int, *, maskable: bool = False) -> list[bytearray]:
    rows: list[bytearray] = []
    step = 1.0 / SUPERSAMPLE
    offset = step / 2

    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    x = px + offset + sx * step
                    y = py + offset + sy * step
                    sr, sg, sb, sa = sample(x, y, size, maskable=maskable)
                    r += sr * sa
                    g += sg * sa
                    b += sb * sa
                    a += sa
            count = SUPERSAMPLE**2
            if a == 0:
                row += b"\x00\x00\x00\x00"
            else:
                row += bytes((round(r / a), round(g / a), round(b / a), round(a / count)))
        rows.append(row)
    return rows


def main() -> None:
    ICONS.mkdir(exist_ok=True)
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
    ]
    for name, size, maskable in targets:
        write_png(ICONS / name, size, size, render(size, maskable=maskable))
        print(f"{name}: {size}x{size} — готово")


if __name__ == "__main__":
    main()
