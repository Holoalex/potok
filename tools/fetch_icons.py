"""Сборка набора иконок из Lucide (MIT) в один модуль.

Иконки кладём в репозиторий, а не тянем с CDN: приложение должно работать офлайн.
Запуск:  python tools/fetch_icons.py
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

RAW = "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/{}.svg"
OUT = Path(__file__).resolve().parent.parent / "js" / "ui" / "icons.js"

# Интерфейс
UI = [
    "list", "chart-pie", "chart-column", "settings", "search",
    "sliders-horizontal", "ellipsis", "x", "check", "chevron-right",
    "chevron-down", "chevron-left", "plus", "minus", "delete", "calendar",
    "tag", "user", "map-pin", "wallet", "credit-card", "piggy-bank",
    "arrow-left-right", "pencil", "trash-2", "copy", "pin", "camera",
    "banknote", "info", "circle-plus", "equal", "divide",
]

# Категории: наше имя -> имя в Lucide
CATEGORIES = {
    "basket": "shopping-basket", "utensils": "utensils", "house": "house",
    "bus": "bus", "health": "heart-pulse", "shirt": "shirt",
    "movie": "clapperboard", "plane": "plane", "package": "package",
    "briefcase": "briefcase", "wrench": "wrench", "gift": "gift",
    "wine": "wine", "beef": "beef", "candy": "candy", "apple": "apple",
    "coffee": "coffee", "sandwich": "sandwich", "restaurant": "utensils-crossed",
    "martini": "martini", "building": "building", "receipt": "receipt",
    "zap": "zap", "armchair": "armchair", "hammer": "hammer",
    "pot": "cooking-pot", "lamp": "lamp", "spray": "spray-can",
    "scissors": "scissors", "taxi": "car-taxi-front", "car": "car",
    "stethoscope": "stethoscope", "pill": "pill", "dumbbell": "dumbbell",
    "footprints": "footprints", "watch": "watch", "film": "film",
    "music": "music", "book": "book-open", "gamepad": "gamepad-2",
    "palette": "palette", "landmark": "landmark", "tent": "tent",
    "bed": "bed-double", "ticket": "ticket", "bag": "shopping-bag",
    "luggage": "luggage", "heart-hands": "heart-handshake",
    "alert": "triangle-alert", "coins": "hand-coins", "percent": "percent",
    "phone": "smartphone", "book-text": "book-text", "sparkles": "sparkles",
}


def fetch(name: str) -> str | None:
    try:
        with urllib.request.urlopen(RAW.format(name), timeout=25) as response:
            return response.read().decode("utf-8")
    except Exception as error:  # noqa: BLE001 — нужен любой сбой сети
        print(f"  ! {name}: {error}")
        return None


def inner(svg: str) -> str:
    """Содержимое <svg>…</svg> без обёртки — обёртку рисуем сами."""
    body = re.sub(r"^.*?<svg[^>]*>", "", svg, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body, flags=re.S)
    return " ".join(body.split())


def main() -> None:
    icons: dict[str, str] = {}
    wanted = {n: n for n in UI} | CATEGORIES

    for key, lucide_name in wanted.items():
        svg = fetch(lucide_name)
        if svg is None:
            continue
        icons[key] = inner(svg)
        print(f"  {key:14} <- {lucide_name}")

    body = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in sorted(icons.items()))
    OUT.write_text(
        "// Иконки Lucide (MIT, https://lucide.dev). Собрано tools/fetch_icons.py.\n"
        "// Лежат в репозитории намеренно: приложение должно работать офлайн.\n\n"
        "export const ICON_PATHS = {\n" + body + ",\n};\n\n"
        "/** SVG-иконка 24×24, красится через currentColor. */\n"
        "export function icon(name, { size = 24, stroke = 2, cls = '' } = {}) {\n"
        "  const body = ICON_PATHS[name] || ICON_PATHS.package || '';\n"
        "  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');\n"
        "  svg.setAttribute('viewBox', '0 0 24 24');\n"
        "  svg.setAttribute('width', size);\n"
        "  svg.setAttribute('height', size);\n"
        "  svg.setAttribute('fill', 'none');\n"
        "  svg.setAttribute('stroke', 'currentColor');\n"
        "  svg.setAttribute('stroke-width', stroke);\n"
        "  svg.setAttribute('stroke-linecap', 'round');\n"
        "  svg.setAttribute('stroke-linejoin', 'round');\n"
        "  svg.setAttribute('aria-hidden', 'true');\n"
        "  if (cls) svg.setAttribute('class', cls);\n"
        "  svg.innerHTML = body;\n"
        "  return svg;\n"
        "}\n\n"
        "export const hasIcon = (name) => Object.hasOwn(ICON_PATHS, name);\n",
        encoding="utf-8",
    )
    print(f"\n{len(icons)} иконок -> {OUT.relative_to(OUT.parent.parent.parent)}")


if __name__ == "__main__":
    main()
