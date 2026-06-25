@echo off
chcp 65001 >nul
title POS System - Instalador

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   🏪 POS System — Instalacion Windows   ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── Check Node.js ──────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado.
    echo Descargalo de: https://nodejs.org (version 20+)
    pause
    exit /b 1
)

echo [✓] Node.js encontrado
node --version

:: ── Install dependencies ───────────────────────
echo.
echo [1/3] Instalando dependencias...
call npm ci --production
if %errorlevel% neq 0 (
    echo [!] npm ci fallo, intentando npm install...
    call npm install --production
)

:: ── Setup database ─────────────────────────────
echo.
echo [2/3] Configurando base de datos...
if not exist .env (
    copy .env.example .env >nul
    echo [✓] Archivo .env creado
)
call npx prisma db push

:: ── Create startup script ──────────────────────
echo.
echo [3/3] Creando acceso directo...

:: Build standalone server
call npm run build

:: Create startup VBS (hidden window)
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run "node ""%~dp0.next\standalone\server.js""", 0, False
) > "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\POS-System.vbs"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   ✅ Instalacion completada!            ║
echo  ║   El servidor iniciara con Windows.     ║
echo  ║   Abre: http://localhost:3000           ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
