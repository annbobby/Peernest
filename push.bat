@echo off
title PeerNest - Push to GitHub
cd /d "%~dp0"
set "PATH=C:\Users\annbo\.gemini\antigravity\scratch\tools\mingit\cmd;%PATH%"
echo ========================================================
echo        PeerNest: Pushing all files to GitHub
echo ========================================================
echo Target: https://github.com/annbobby/Peernest.git
echo.
git.exe push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Everything has been pushed successfully to GitHub!
) else (
    echo [ERROR] Push failed. If prompted, please complete GitHub authentication.
)
echo.
pause
