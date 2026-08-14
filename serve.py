"""Локальный сервер для разработки.

ES-модули и service worker не работают при открытии файла напрямую (file://),
поэтому приложение нужно отдавать по http. Достаточно стандартной библиотеки.

Запуск:  python serve.py
         python serve.py 5000        — другой порт
         python serve.py --lan       — раздать в локальную сеть (для телефона)
"""

from __future__ import annotations

import argparse
import http.server
import socket
import socketserver
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".css": "text/css",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:
        # no-cache, а не no-store: правки всё так же видны сразу (браузер каждый раз
        # перепроверяет файл), но service worker может положить ответ в свой кэш —
        # иначе офлайн-режим на localhost не проверить вообще никак.
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        if "GET" in (args[0] if args else ""):
            super().log_message(fmt, *args)


def lan_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def main() -> None:
    parser = argparse.ArgumentParser(description="Локальный сервер приложения «Деньги»")
    parser.add_argument("port", nargs="?", type=int, default=8000)
    parser.add_argument("--lan", action="store_true", help="слушать все интерфейсы")
    parser.add_argument("--no-browser", action="store_true", help="не открывать браузер")
    args = parser.parse_args()

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    handler = partial(Handler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer((host, args.port), handler) as httpd:
        local_url = f"http://localhost:{args.port}/"
        print(f"Приложение: {local_url}")
        if args.lan:
            print(f"С телефона:  http://{lan_ip()}:{args.port}/")
            print("  (по http установка PWA недоступна — см. README, раздел «Установка на телефон»)")
        print("Остановить: Ctrl+C")

        if not args.no_browser:
            webbrowser.open(local_url)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nСервер остановлен")


if __name__ == "__main__":
    main()
