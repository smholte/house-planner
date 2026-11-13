#!/usr/bin/env bash
# Set-up of a Claude Code (web) session for House Planner. Skips what is there; prints one line per part.
# Safe to run again. Needs: python3, pip, internet to PyPI (and cdn.playwright.dev only if Chromium is missing).
T0=$(date +%s)
cd "$(dirname "$0")/.." || exit 1
FAIL=0

# 1. Python packages (pinned in tools/requirements-dev.txt)
if python3 - <<'PY' 2>/dev/null
import playwright, PIL
from importlib.metadata import version
want = dict(l.strip().split('==') for l in open('tools/requirements-dev.txt') if '==' in l and not l.startswith('#'))
raise SystemExit(0 if all(version(k) == v for k, v in want.items()) else 1)
PY
then echo "packages: already there"
else
  pip install -q -r tools/requirements-dev.txt --break-system-packages 2>/dev/null || pip install -q -r tools/requirements-dev.txt \
    && echo "packages: installed" || { echo "packages: FAILED"; FAIL=1; }
fi

# 2. Chromium (the web sessions come with one in /opt/pw-browsers; otherwise download it)
if python3 - <<'PY' 2>/dev/null
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); b.close()
PY
then echo "chromium: already there"
else
  python3 -m playwright install --with-deps chromium >/dev/null 2>&1 || python3 -m playwright install chromium >/dev/null 2>&1 \
    && echo "chromium: installed" || { echo "chromium: FAILED"; FAIL=1; }
fi

echo "ready in $(( $(date +%s) - T0 )) s"
exit $FAIL
