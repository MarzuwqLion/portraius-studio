@echo off
rem Portraius Studio: starts ComfyUI so the hosted app (https://marzuwqlion.github.io/portraius-studio/) can reach it.
rem Put this file in your ComfyUI_windows_portable folder, next to run_nvidia_gpu.bat, and double-click it.
rem ComfyUI allows one page address at a time; use run_portraius_dev.bat for npm run dev on this computer.
cd /d "%~dp0"
if not exist python_embeded\python.exe (
  echo This file goes in your ComfyUI_windows_portable folder, next to run_nvidia_gpu.bat.
  pause
  exit /b 1
)
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --enable-cors-header https://marzuwqlion.github.io
pause
