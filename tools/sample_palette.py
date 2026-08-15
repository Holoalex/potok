"""Семантические цвета: суммы, акценты, текст.

В общей гистограмме их не видно — они занимают доли процента площади.
Ищем их по насыщенности и по светлоте, отдельно от фонов.
"""

import colorsys
from collections import Counter
from pathlib import Path

from PIL import Image

NATIVE = Path(__file__).resolve().parent / "frames" / "native"
CROPS = Path(__file__).resolve().parent / "crops"
CROPS.mkdir(exist_ok=True)

# Зелёная плашка «Удалить демо-данные» — не цвет интерфейса, исключаем.
DEMO_BANNER = (0x30, 0xa0, 0x44)


def hsl(rgb):
    r, g, b = (c / 255 for c in rgb)
    h, light, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s, light


def near(a, b, tol=26):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def analyze(idx: int, label: str, band: tuple[float, float] | None = None) -> None:
    path = NATIVE / f"{idx:03d}.png"
    if not path.exists():
        print(f"[{idx}] нет кадра")
        return
    img = Image.open(path).convert("RGB")
    w, h = img.size
    top, bottom = band or (0.045, 0.965)
    img = img.crop((0, int(h * top), w, int(h * bottom)))
    px = Counter(img.getdata())
    total = sum(px.values())

    saturated, darks = [], []
    for rgb, n in px.items():
        if n / total < 0.00008:
            continue
        if near(rgb, DEMO_BANNER):
            continue
        _, s, light = hsl(rgb)
        if s > 0.45 and 0.2 < light < 0.75:
            saturated.append((n, rgb, s, light))
        if light < 0.35 and s < 0.25:
            darks.append((n, rgb, light))

    saturated.sort(reverse=True)
    darks.sort(reverse=True)

    print(f"\n=== кадр {idx:03d} — {label}")
    print("  насыщенные (суммы, полосы, иконки):")
    for n, rgb, s, light in saturated[:10]:
        hexv = "#%02x%02x%02x" % rgb
        hue, _, _ = hsl(rgb)
        name = ("красный" if hue < 20 or hue > 330 else
                "оранжевый" if hue < 45 else
                "жёлтый" if hue < 70 else
                "зелёный" if hue < 165 else
                "голубой" if hue < 200 else
                "синий" if hue < 250 else
                "фиолетовый" if hue < 290 else "розовый")
        print(f"    {hexv}  {n/total*100:5.2f} %  тон {hue:5.1f}° — {name}")
    print("  тёмные (текст):")
    for n, rgb, light in darks[:5]:
        print("    #%02x%02x%02x  %5.2f %%  светлота %.2f" % (*rgb, n / total * 100, light))


def crop_out(idx: int, name: str, box: tuple[float, float, float, float]) -> None:
    path = NATIVE / f"{idx:03d}.png"
    if not path.exists():
        return
    img = Image.open(path)
    w, h = img.size
    x0, y0, x1, y1 = box
    out = img.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
    out.save(CROPS / f"{name}.png")
    print(f"  вырезано {name}.png  {out.size[0]}x{out.size[1]}")


if __name__ == "__main__":
    analyze(11, "Операции", band=(0.20, 0.90))
    analyze(24, "Добавление операции")
    analyze(76, "Отчёт — круг", band=(0.55, 0.90))
    analyze(150, "План")
    analyze(180, "Тёмная тема")

    print("\nвырезки для просмотра:")
    crop_out(11, "operations-rows", (0.0, 0.30, 1.0, 0.52))
    crop_out(24, "entry-fields", (0.0, 0.06, 1.0, 0.32))
    crop_out(76, "report-list", (0.0, 0.62, 1.0, 0.82))
    crop_out(150, "plan-rows", (0.0, 0.10, 1.0, 0.34))
