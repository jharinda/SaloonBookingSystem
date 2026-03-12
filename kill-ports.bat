@echo off
REM SnapSalon - Kill All Service Ports
REM This batch file kills all processes running on the ports used by SnapSalon services

echo.
echo ============================================
echo  SnapSalon Port Killer
echo ============================================
echo.
echo Killing processes on ports: 3000-3009, 4200
echo.

npm run kill-ports

echo.
echo Done!
pause
