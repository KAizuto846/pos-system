@echo off
chcp 65001 >nul
title POS System - Instalador Windows

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   POS System - Instalador Windows        ║
echo  ║   Sistema de Punto de Venta              ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este instalador requiere permisos de Administrador.
    echo.
    echo Por favor:
    echo   1. Haga clic derecho en este archivo
    echo   2. Seleccione "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

:: Check if PowerShell is available
where powershell >nul 2>nul
if %errorLevel% neq 0 (
    echo [ERROR] PowerShell no encontrado.
    pause
    exit /b 1
)

:: Get the directory of this script
set "SCRIPT_DIR=%~dp0"

echo [INFO] Iniciando instalador PowerShell...
echo.

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1"

if %errorLevel% neq 0 (
    echo.
    echo [ERROR] La instalacion fallo. Revise los mensajes anteriores.
    pause
    exit /b 1
)

echo.
echo [EXITO] Instalacion completada correctamente.
pause