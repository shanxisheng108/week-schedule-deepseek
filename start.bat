@echo off
cd /d "%~dp0"
echo.
echo   Week Schedule Tool - starting local server...
echo   URL: http://127.0.0.1:5173
echo   Close this window to stop.
echo.
start "" /b cmd /c "timeout /t 2 >nul & start http://127.0.0.1:5173"
node server.js
pause
