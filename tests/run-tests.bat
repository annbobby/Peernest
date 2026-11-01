@echo off
title PeerNest - Automated Test Suite Runner
set ELECTRON_RUN_AS_NODE=1
echo ================================================================
echo Running PeerNest Comprehensive Automated Test Suite...
echo ================================================================
cd /d "%~dp0\.."
"C:\Users\annbo\AppData\Local\Programs\antigravity\Antigravity.exe" tests\run-tests.js
echo.
pause
