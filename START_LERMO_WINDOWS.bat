@echo off
title LERMO - Secure Chat Platform
cls

echo.
echo =========================================================
echo        LERMO - Secure Chat Platform
echo =========================================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed!
    echo.
    echo  Please download and install Node.js from:
    echo  https://nodejs.org  ^(choose the LTS version^)
    echo.
    echo  After installing Node.js, run this file again.
    echo.
    pause
    exit /b 1
)

echo  Node.js found!
echo.

cd /d "%~dp0backend"

echo  Installing / checking dependencies...
call npm install --silent 2>nul
echo  Dependencies ready!
echo.

echo =========================================================
echo.
echo  YOUR LERMO SERVER ADDRESS:
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set RAWIP=%%a
    setlocal enabledelayedexpansion
    set CLEANIP=!RAWIP: =!
    echo     http://!CLEANIP!:8888
    endlocal
)
echo.
echo  Share the address above with everyone on the same Wi-Fi.
echo  Works on: iPhone, iPad, Android, Mac, Windows.
echo.
echo  Admin account: use your configured administrator credentials
echo.
echo =========================================================
echo.
echo  Server is starting... DO NOT close this window.
echo  When you see the LERMO banner below, open your browser.
echo.

node server.js

pause
