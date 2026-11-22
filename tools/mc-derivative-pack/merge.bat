@echo off
chcp 65001 >nul
title Derivative 安装包 - 合并分卷
echo ============================================================
echo   Derivative 安装包 - 合并分卷
echo   把所有 part 文件和 parts-manifest.json 放在本脚本同一文件夹
echo ============================================================
echo.
where python >nul 2>nul
if %errorlevel%==0 (
  python "%~dp0merge.py"
) else (
  echo 未检测到 Python，尝试用 PowerShell 合并...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0merge.ps1"
)
echo.
pause
