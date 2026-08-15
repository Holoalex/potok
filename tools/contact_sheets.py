"""Обзорные листы: много кадров на одной картинке.

Смотреть 216 кадров по одному дорого. Сначала листы — по ним видно, где какой
экран, потом отдельные кадры в полном разрешении там, где нужно мерить.
"""

import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
BASE = Path(__file__).resolve().parent / "frames"

COLS, ROWS = 8, 3
PER_SHEET = COLS * ROWS
THUMB_W = 200


def build(tag: str) -> None:
    src = BASE / tag
    frames = sorted(src.glob("*.jpg"))
    if not frames:
        print(f"{tag}: кадров нет")
        return

    out = BASE / f"sheets-{tag}"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.jpg"):
        old.unlink()

    for sheet_no, start in enumerate(range(0, len(frames), PER_SHEET), start=1):
        chunk = frames[start:start + PER_SHEET]
        listfile = out / f"_{sheet_no}.txt"
        listfile.write_text(
            "".join(f"file '{f.as_posix()}'\nduration 1\n" for f in chunk), encoding="utf-8"
        )
        subprocess.run(
            [FFMPEG, "-hide_banner", "-loglevel", "error",
             "-f", "concat", "-safe", "0", "-i", str(listfile),
             "-vf", f"scale={THUMB_W}:-2,tile={COLS}x{ROWS}:margin=6:padding=4:color=0x202020",
             "-frames:v", "1", "-q:v", "4",
             str(out / f"sheet{sheet_no:02d}.jpg")],
            check=True,
        )
        listfile.unlink()
        first, last = start + 1, start + len(chunk)
        print(f"  sheet{sheet_no:02d}.jpg — кадры {first}–{last}")

    print(f"{tag}: {len(frames)} кадров -> {sheet_no} листов "
          f"({COLS}x{ROWS}, слева направо сверху вниз)")


if __name__ == "__main__":
    for tag in sys.argv[1:] or ["short", "long"]:
        print(f"\n=== {tag}")
        build(tag)
