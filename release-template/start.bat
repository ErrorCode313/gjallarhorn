@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

if not exist ".env" (
    echo .env file not found.
    echo Please run setup.bat first to enter your API keys.
    echo.
    pause
    exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "LINE=%%a"
    if not "!LINE:~0,1!"=="#" if not "%%a"=="" set "%%a=%%b"
)

if "!GJALLARHORN_STARTGG!"=="" if "!GJALLARHORN_CM_REFRESH_KEY!"=="" (
    echo No API keys found in .env.
    echo Re-run setup.bat to set at least one key.
    pause
    exit /b 1
)

echo Starting Gjallarhorn...
echo The dashboard will open in your browser at http://localhost:3000
echo Close this window to stop the server.
echo.

start "" "http://localhost:3000"

"%~dp0node\node.exe" "%~dp0packages\cli\lib\index.js"

endlocal
