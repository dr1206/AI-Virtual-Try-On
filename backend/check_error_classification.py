"""Verifies how main.py classifies the two AppError shapes we observed.

No network, no model call. It only imports the two helper functions
from backend/main.py by source, so it cannot start FastAPI.
"""

from __future__ import annotations

import ast
from pathlib import Path

from gradio_client.exceptions import AppError

BASE_DIR = Path(__file__).resolve().parent
SOURCE = (BASE_DIR / "main.py").read_text(encoding="utf-8")

# Pull just the two helper functions out of main.py with the AST, so
# this check never imports main.py (which would start FastAPI).
tree = ast.parse(SOURCE)

wanted = {"is_quota_exhausted", "friendly_error"}
chunks = [
    ast.get_source_segment(SOURCE, node)
    for node in tree.body
    if isinstance(node, ast.FunctionDef) and node.name in wanted
]

assert len(chunks) == len(wanted), "could not locate the helper functions"

namespace: dict = {}
exec("\n\n".join(chunks), namespace)

is_quota_exhausted = namespace["is_quota_exhausted"]
friendly_error = namespace["friendly_error"]

# The exact message produced by the live Space just now.
REAL_QUOTA = AppError(
    "'You have exceeded your free ZeroGPU quota "
    "(60s requested vs. 81s left). Try again in 0:29:16. "
    "Subscribe to Hugging Face PRO to get 25 min of ZeroGPU quota a day'"
)

# The message reported from the extension.
GENERIC = AppError(
    "The upstream Gradio app has raised an exception but has not "
    "enabled verbose error reporting. To enable, set show_error=True "
    "in launch()."
)

print("1) Real ZeroGPU quota error")
print("   is_quota_exhausted :", is_quota_exhausted(REAL_QUOTA))
print("   friendly_error     :", friendly_error(REAL_QUOTA))
print()
print("2) Generic 'not enabled verbose error reporting' error")
print("   is_quota_exhausted :", is_quota_exhausted(GENERIC))
print("   'AppError' in str  :", "AppError" in str(GENERIC))
print("   friendly_error     :", friendly_error(GENERIC))
