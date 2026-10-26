#!/usr/bin/env sh
# Portraius Studio: starts ComfyUI so the app can reach it, for a ComfyUI installed from git (Linux or Mac).
# Put this file in your ComfyUI folder (the one with main.py), then run one of these (anything after live, dev or
# preview goes to ComfyUI, for example: sh run_portraius.sh dev --listen):
#   sh run_portraius.sh            for the hosted app, https://marzuwqlion.github.io/portraius-studio/
#   sh run_portraius.sh dev        for npm run dev on this computer
#   sh run_portraius.sh preview    for npm run preview
cd "$(dirname "$0")" || exit 1
if [ ! -f main.py ]; then
  echo "This file goes in your ComfyUI folder, the one with main.py."
  exit 1
fi
case "${1:-live}" in
  live) origin=https://marzuwqlion.github.io ;;
  dev) origin=http://localhost:5173 ;;
  preview) origin=http://localhost:4173 ;;
  *) echo "Usage: sh run_portraius.sh [live|dev|preview]"; exit 1 ;;
esac
[ $# -gt 0 ] && shift
# Use ComfyUI's own Python environment when it has one here.
for env in venv .venv; do
  if [ -f "$env/bin/activate" ]; then
    . "$env/bin/activate"
    break
  fi
done
python=python
command -v python >/dev/null 2>&1 || python=python3
exec "$python" main.py --enable-cors-header "$origin" "$@"
