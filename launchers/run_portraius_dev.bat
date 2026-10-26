@echo off
rem Portraius Studio: starts ComfyUI so npm run dev on this computer (http://localhost:5173) can reach it.
rem Put this file in your ComfyUI_windows_portable folder, next to run_nvidia_gpu.bat, and double-click it.
rem ComfyUI allows one page address at a time; use run_portraius_live.bat for the hosted app.
cd /d "%~dp0"
if not exist python_embeded\python.exe (
  echo This file goes in your ComfyUI_windows_portable folder, next to run_nvidia_gpu.bat.
  pause
  exit /b 1
)
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --enable-cors-header http://localhost:5173
pause
