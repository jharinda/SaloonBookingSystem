@echo off
REM SnapSalon - Kill All Service Ports
REM This batch file kills all processes running on the ports used by SnapSalon services
REM Run from repo root via npm (changes directory to workspace root).

cd /d "%~dp0..\.."

echo.
echo ============================================
echo  SnapSalon Port Killer
echo ============================================
echo.
echo Killing processes on ports: 3000-3009, 4200
echo.

call npm run kill-ports

echo.
echo Done!
pause
