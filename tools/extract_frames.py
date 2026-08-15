"""Разбор записей экрана на кадры.

Берём не каждый n-й кадр, а только те, где картинка заметно изменилась —
для прохода по интерфейсу это ровно смена экранов, без тысяч дублей.
"""

import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FFPROBE = FFMPEG.replace("ffmpeg-win", "ffprobe-win")

REF = Path(r"C:\Users\a\Documents\Money app\Референсы money flow")
OUT = Path(__file__).resolve().parent / "frames"


def probe(path: Path) -> None:
    """Длительность и разрешение — читаем из вывода ffmpeg, ffprobe может отсутствовать."""
    proc = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    for line in proc.stderr.splitlines():
        if "Duration" in line or "Stream #" in line:
            print("   ", line.strip())


def extract(path: Path, tag: str, threshold: float = 0.12, height: int = 1000) -> int:
    folder = OUT / tag
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("*.jpg"):
        old.unlink()

    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-vf", f"select='gt(scene,{threshold})',scale=-2:{height}",
        "-vsync", "vfr", "-q:v", "3",
        str(folder / "%03d.jpg"),
    ]
    subprocess.run(cmd, check=True)
    return len(list(folder.glob("*.jpg")))


def main() -> None:
    videos = sorted(p for p in REF.iterdir() if p.suffix.lower() in {".mp4", ".mov"})
    summary = {}
    for video in videos:
        tag = "short" if video.stat().st_size < 100 * 1024 * 1024 else "long"
        print(f"\n=== {video.name} ({video.stat().st_size / 1024 / 1024:.0f} МБ) -> {tag}")
        probe(video)
        count = extract(video, tag)
        print(f"    кадров со сменой экрана: {count}")
        summary[tag] = {"file": video.name, "frames": count}

    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
