@echo off
setlocal ENABLEDELAYEDEXPANSION

set PORT=17653

where python >nul 2>nul
if %errorlevel%==0 (
  set PY=python
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set PY=py
  ) else (
    echo Python not found. Install Python 3.x and re-run.
    pause
    exit /b 1
  )
)

if not exist .venv (
  %PY% -m venv .venv
  if %errorlevel% neq 0 (
    echo Failed to create virtual environment.
    pause
    exit /b 1
  )
)

call .venv\Scripts\activate.bat

python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if %errorlevel% neq 0 (
  echo Dependency install failed.
  pause
  exit /b 1
)

echo.
echo Starting local API on http://127.0.0.1:%PORT%
echo Close this window to stop the server.
echo.

python -m uvicorn main:app --host 127.0.0.1 --port %PORT% --workers 1
