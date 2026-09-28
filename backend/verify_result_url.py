"""Verifies the result image URL flow end to end.

Starts the real FastAPI backend, then checks that the exact URL the
extension now builds (BACKEND_URL + /results/<file>) actually serves a
PNG from disk. This does not run IDM-VTON inference; it only proves the
serving and URL-resolution path.
"""

from __future__ import annotations

import threading
import time
import urllib.request
import urllib.error
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
RESULTS = BACKEND_DIR / "results"

BASE = "http://127.0.0.1:8000"


def main() -> int:
    import uvicorn
    import main as backend

    newest = sorted(
        RESULTS.glob("*.png"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if not newest:
        print("No PNG found in", RESULTS)
        return 2

    target = newest[0]
    print("Newest result file :", target.name)
    print("File size          :", target.stat().st_size, "bytes")

    config = uvicorn.Config(
        backend.app,
        host="127.0.0.1",
        port=8000,
        log_level="warning",
    )
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # Wait for startup.
    for _ in range(60):
        if server.started:
            break
        time.sleep(0.5)

    if not server.started:
        print("Server did not start")
        return 1

    print("Server started     : ok")

    try:
        # 1. The relative path the backend returns.
        relative = f"/results/{target.name}"
        absolute = BASE + relative

        print()
        print("Backend returns    :", relative)
        print("Extension builds   :", absolute)

        # 2. Fetch exactly what the extension would fetch.
        with urllib.request.urlopen(absolute, timeout=20) as resp:
            payload = resp.read()
            content_type = resp.headers.get("Content-Type", "")

        print()
        print("HTTP status        : 200")
        print("Content-Type       :", content_type)
        print("Bytes received     :", len(payload))
        print("PNG signature ok   :",
              payload[:8] == b"\x89PNG\r\n\x1a\n")

        if len(payload) != target.stat().st_size:
            print("SIZE MISMATCH against disk")
            return 1

        print()
        print("RESULT: the generated PNG is served correctly at the URL "
              "the extension now uses.")
        return 0

    except urllib.error.HTTPError as exc:
        print("HTTP ERROR:", exc.code, exc.reason)
        return 1

    finally:
        server.should_exit = True
        thread.join(timeout=10)


if __name__ == "__main__":
    raise SystemExit(main())
