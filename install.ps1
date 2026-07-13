<# 
.SYNOPSIS
    POS System - Instalador Profesional para Windows
.DESCRIPTION
    Instalador completo con integración nativa de Windows:
    - Instalación per-machine (requiere admin) o per-user
    - Accesos directos en Menú Inicio y Escritorio
    - Registro de desinstalación en "Agregar/Quitar programas"
    - Asociación de protocolo pos:// (opcional)
    - Inicio automático con Windows (opcional)
    - Verificación de prerrequisitos
.NOTES
    Autor: KAizuto846
    Versión: 1.0.0
#>

param(
    [Parameter(Mandatory=$false)]
    [switch]$Silent,

    [Parameter(Mandatory=$false)]
    [switch]$PerUser,

    [Parameter(Mandatory=$false)]
    [switch]$NoShortcuts,

    [Parameter(Mandatory=$false)]
    [switch]$NoAutoStart,

    [Parameter(Mandatory=$false)]
    [string]$InstallPath,

    [Parameter(Mandatory=$false)]
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Configuración ──────────────────────────────────────────────
$script:ProductName = "POS System"
$script:ProductVersion = "1.0.0"
$script:Publisher = "KAizuto846"
$script:AppId = "com.possystem.app"
$script:GitHubRepo = "KAizuto846/pos-system"
$script:ExeName = "POS System.exe"
$script:UninstallerName = "uninstall.exe"

# Colores
$Green = [ConsoleColor]::Green
$Yellow = [ConsoleColor]::Yellow
$Red = [ConsoleColor]::Red
$Cyan = [ConsoleColor]::Cyan
$Gray = [ConsoleColor]::DarkGray

# ─── Funciones de Utilidad ──────────────────────────────────────
function Write-Header { param($msg) Write-Host "`n=================================================" -Fore $Cyan; Write-Host "  $msg" -Fore $Cyan; Write-Host "=================================================`n" -Fore $Cyan }
function Write-Success { param($msg) Write-Host "[✓] $msg" -Fore $Green }
function Write-Warning { param($msg) Write-Host "[!] $msg" -Fore $Yellow }
function Write-ErrorMsg { param($msg) Write-Host "[✗] $msg" -Fore $Red }
function Write-Info { param($msg) Write-Host "[i] $msg" -Fore $Gray }

function Test-Admin {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-InstallPath {
    if ($PerUser) {
        return Join-Path $env:LOCALAPPDATA $script:ProductName
    } else {
        return Join-Path ${env:ProgramFiles(x86)} $script:ProductName
    }
}

function Get-UninstallKeyPath {
    if ($PerUser) { "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$script:AppId" }
    else { "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$script:AppId" }
}

function Show-Banner {
    Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                    POS System v$script:ProductVersion                     ║
║              Instalador Profesional para Windows              ║
║                         $script:Publisher                           ║
╚══════════════════════════════════════════════════════════════╝
"@ -Fore $Cyan
}

# ─── Verificación de Prerrequisitos ─────────────────────────────
function Test-Prerequisites {
    Write-Header "VERIFICANDO PRERREQUISITOS"
    $errors = 0

    # Verificar Windows 10+
    $os = [Environment]::OSVersion.Version
    if ($os.Major -lt 10) {
        Write-ErrorMsg "Se requiere Windows 10 o superior (actual: $os)"
        $errors++
    } else {
        Write-Success "Windows $os - OK"
    }

    # Verificar arquitectura x64
    if ([Environment]::Is64BitOperatingSystem) {
        Write-Success "Arquitectura x64 - OK"
    } else {
        Write-ErrorMsg "Se requiere Windows de 64 bits"
        $errors++
    }

    # Verificar espacio en disco (mínimo 500MB)
    $drive = (Get-InstallPath).Substring(0,3)
    $freeSpace = (Get-Volume -DriveLetter $drive.TrimEnd(':')).SizeRemaining / 1GB
    if ($freeSpace -lt 0.5) {
        Write-ErrorMsg "Espacio insuficiente: ${freeSpace:N1} GB disponibles (mín: 500 MB)"
        $errors++
    } else {
        Write-Success "Espacio en disco: ${freeSpace:N1} GB disponibles"
    }

    # Verificar si ya está instalado
    $uninstallKey = Get-UninstallKeyPath
    if (Test-Path $uninstallKey) {
        $existing = Get-ItemProperty $uninstallKey
        Write-Warning "Ya existe una instalación: $($existing.DisplayVersion) en $($existing.InstallLocation)"
        if (-not $Silent -and -not $Uninstall) {
            $choice = Read-Host "¿Desea reinstalar? (S/N)"
            if ($choice -notmatch '^[sSyY]') { exit 0 }
        }
    }

    if ($errors -gt 0) {
        Write-ErrorMsg "Prerrequisitos no cumplidos. Instalación cancelada."
        exit 1
    }
}

# ─── Desinstalación ─────────────────────────────────────────────
function Uninstall-Application {
    Write-Header "DESINSTALANDO $script:ProductName"
    
    $installPath = Get-InstallPath
    $uninstallKey = Get-UninstallKeyPath

    # Detener procesos en ejecución
    $procs = Get-Process -Name "POS System" -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Info "Deteniendo procesos en ejecución..."
        $procs | Stop-Process -Force
        Start-Sleep -Seconds 1
    }

    # Eliminar tarea de inicio automático
    $taskName = "POSSystemAutoStart"
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Success "Tarea de inicio automático eliminada"
    }

    # Eliminar archivos
    if (Test-Path $installPath) {
        Write-Info "Eliminando archivos en $installPath..."
        Remove-Item $installPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "Archivos eliminados"
    }

    # Eliminar accesos directos
    if (-not $NoShortcuts) {
        $shortcuts = @(
            Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$script:ProductName",
            Join-Path [Environment]::GetFolderPath('CommonStartMenu') "Programs\$script:ProductName",
            Join-Path [Environment]::GetFolderPath('Desktop') "$script:ProductName.lnk",
            Join-Path [Environment]::GetFolderPath('CommonDesktopDirectory') "$script:ProductName.lnk"
        )
        foreach ($sc in $shortcuts) {
            if (Test-Path $sc) { Remove-Item $sc -Recurse -Force -ErrorAction SilentlyContinue }
        }
        Write-Success "Accesos directos eliminados"
    }

    # Eliminar registro de desinstalación
    if (Test-Path $uninstallKey) {
        Remove-Item $uninstallKey -Recurse -Force
        Write-Success "Registro de desinstalación eliminado"
    }

    # Eliminar clave de configuración
    $configKey = if ($PerUser) { "HKCU:\Software\$script:ProductName" } else { "HKLM:\Software\$script:ProductName" }
    if (Test-Path $configKey) { Remove-Item $configKey -Recurse -Force }

    Write-Success "`n$script:ProductName desinstalado correctamente."
    if (-not $Silent) { Read-Host "Presione Enter para salir" }
    exit 0
}

# ─── Instalación ────────────────────────────────────────────────
function Install-Application {
    Write-Header "INSTALANDO $script:ProductName v$script:ProductVersion"
    
    $installPath = Get-InstallPath
    if ($InstallPath) { $installPath = $InstallPath }
    
    Write-Info "Ruta de instalación: $installPath"
    Write-Info "Modo: $(if ($PerUser) { 'Por usuario' } else { 'Sistema (requiere admin)' })"

    # Verificar permisos de admin si es instalación sistema
    if (-not $PerUser -and -not (Test-Admin)) {
        Write-ErrorMsg "Instalación para todo el sistema requiere permisos de administrador."
        Write-Info "Re-ejecute PowerShell como Administrador o use -PerUser"
        exit 1
    }

    # Crear directorio de instalación
    Write-Info "Creando directorio de instalación..."
    New-Item -ItemType Directory -Path $installPath -Force | Out-Null
    Write-Success "Directorio creado: $installPath"

    # Copiar archivos (desde dist-electron/win-unpacked)
    $sourceDir = Join-Path $PSScriptRoot "dist-electron\win-unpacked"
    if (-not (Test-Path $sourceDir)) {
        $sourceDir = Join-Path $PSScriptRoot "dist-electron\win-unpacked\resources\app"
    }
    if (-not (Test-Path $sourceDir)) {
        Write-ErrorMsg "No se encontraron archivos de instalación en dist-electron\win-unpacked"
        Write-Info "Primero ejecute: npm run electron:build"
        exit 1
    }

    Write-Info "Copiando archivos de la aplicación..."
    $files = Get-ChildItem $sourceDir -Recurse -File
    $count = 0
    foreach ($file in $files) {
        $relPath = $file.FullName.Substring($sourceDir.Length + 1)
        $destFile = Join-Path $installPath $relPath
        $destDir = Split-Path $destFile -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item $file.FullName $destFile -Force
        $count++
        if ($count % 100 -eq 0) { Write-Host "." -NoNewline -Fore $Gray }
    }
    Write-Host ""
    Write-Success "$count archivos copiados"

    # Crear desinstalador
    Write-Info "Creando desinstalador..."
    $uninstallerPath = Join-Path $installPath $script:UninstallerName
    $selfPath = $PSCommandPath
    Copy-Item $selfPath $uninstallerPath -Force
    Write-Success "Desinstalador creado: $uninstallerPath"

    # Registrar en "Agregar/Quitar programas"
    Write-Info "Registrando en el sistema..."
    $uninstallKey = Get-UninstallKeyPath
    New-Item -Path $uninstallKey -Force | Out-Null
    Set-ItemProperty $uninstallKey -Name "DisplayName" -Value $script:ProductName
    Set-ItemProperty $uninstallKey -Name "DisplayVersion" -Value $script:ProductVersion
    Set-ItemProperty $uninstallKey -Name "Publisher" -Value $script:Publisher
    Set-ItemProperty $uninstallKey -Name "InstallLocation" -Value $installPath
    Set-ItemProperty $uninstallKey -Name "UninstallString" -Value "`"$uninstallerPath`" -Uninstall"
    Set-ItemProperty $uninstallKey -Name "QuietUninstallString" -Value "`"$uninstallerPath`" -Uninstall -Silent"
    Set-ItemProperty $uninstallKey -Name "DisplayIcon" -Value (Join-Path $installPath $script:ExeName)
    Set-ItemProperty $uninstallKey -Name "NoModify" -Value 1 -Type DWord
    Set-ItemProperty $uninstallKey -Name "NoRepair" -Value 1 -Type DWord
    Set-ItemProperty $uninstallKey -Name "EstimatedSize" -Value 500000 -Type DWord
    Set-ItemProperty $uninstallKey -Name "URLInfoAbout" -Value "https://github.com/$script:GitHubRepo"
    Set-ItemProperty $uninstallKey -Name "URLUpdateInfo" -Value "https://github.com/$script:GitHubRepo/releases"
    Write-Success "Registro de desinstalación creado"

    # Crear clave de configuración
    $configKey = if ($PerUser) { "HKCU:\Software\$script:ProductName" } else { "HKLM:\Software\$script:ProductName" }
    New-Item -Path $configKey -Force | Out-Null
    Set-ItemProperty $configKey -Name "InstallPath" -Value $installPath
    Set-ItemProperty $configKey -Name "Version" -Value $script:ProductVersion
    Set-ItemProperty $configKey -Name "PerUser" -Value $PerUser -Type DWord

    # Crear accesos directos
    if (-not $NoShortcuts) {
        Write-Info "Creando accesos directos..."
        $exePath = Join-Path $installPath $script:ExeName
        $iconPath = $exePath

        # Menú Inicio (usuario actual)
        $smPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$script:ProductName"
        New-Item -ItemType Directory -Path $smPath -Force | Out-Null
        New-Shortcut -Path (Join-Path $smPath "$script:ProductName.lnk") -Target $exePath -Icon $iconPath
        New-Shortcut -Path (Join-Path $smPath "Desinstalar.lnk") -Target $uninstallerPath -Args "-Uninstall" -Icon $iconPath

        # Menú Inicio (todos los usuarios) - si es admin
        if (-not $PerUser -and (Test-Admin)) {
            $smAll = Join-Path [Environment]::GetFolderPath('CommonStartMenu') "Programs\$script:ProductName"
            New-Item -ItemType Directory -Path $smAll -Force | Out-Null
            New-Shortcut -Path (Join-Path $smAll "$script:ProductName.lnk") -Target $exePath -Icon $iconPath
            New-Shortcut -Path (Join-Path $smAll "Desinstalar.lnk") -Target $uninstallerPath -Args "-Uninstall" -Icon $iconPath
        }

        # Escritorio
        $deskPath = Join-Path [Environment]::GetFolderPath('Desktop') "$script:ProductName.lnk"
        New-Shortcut -Path $deskPath -Target $exePath -Icon $iconPath
        if (-not $PerUser -and (Test-Admin)) {
            $deskAll = Join-Path [Environment]::GetFolderPath('CommonDesktopDirectory') "$script:ProductName.lnk"
            New-Shortcut -Path $deskAll -Target $exePath -Icon $iconPath
        }
        Write-Success "Accesos directos creados"
    }

    # Configurar inicio automático con Windows (tarea programada)
    if (-not $NoAutoStart) {
        Write-Info "Configurando inicio automático..."
        $taskName = "POSSystemAutoStart"
        $exePath = Join-Path $installPath $script:ExeName
        $action = New-ScheduledTaskAction -Execute $exePath -Argument "--hidden"
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction SilentlyContinue
        Write-Success "Inicio automático configurado (tarea programada como SYSTEM)"
    }

    # Verificar instalación
    Write-Header "VERIFICANDO INSTALACIÓN"
    $exePath = Join-Path $installPath $script:ExeName
    if (Test-Path $exePath) {
        Write-Success "Ejecutable principal: $exePath"
        $version = (Get-Item $exePath).VersionInfo.FileVersion
        Write-Success "Versión del archivo: $version"
    } else {
        Write-ErrorMsg "ERROR: Ejecutable no encontrado en $exePath"
        exit 1
    }

    # Finalizar
    Write-Header "INSTALACIÓN COMPLETADA"
    Write-Success "$script:ProductName v$script:ProductVersion instalado correctamente"
    Write-Info "Ubicación: $installPath"
    Write-Info "Ejecutable: $exePath"
    if (-not $NoShortcuts) {
        Write-Info "Accesos directos creados en Menú Inicio y Escritorio"
    }
    if (-not $NoAutoStart) {
        Write-Info "Inicio automático con Windows: HABILITADO"
    }
    Write-Host ""
    Write-Info "Para desinstalar: Ejecute 'Desinstalar' desde el Menú Inicio o use:"
    Write-Host "  `"$uninstallerPath`" -Uninstall" -Fore $Gray
    Write-Host ""
    
    if (-not $Silent) {
        $choice = Read-Host "¿Desea ejecutar $script:ProductName ahora? (S/N)"
        if ($choice -match '^[sSyY]') {
            Start-Process $exePath
        }
    }
}

function New-Shortcut {
    param($Path, $Target, $Args = "", $Icon = "")
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $Target
    $shortcut.Arguments = $Args
    if ($Icon) { $shortcut.IconLocation = "$Icon,0" }
    $shortcut.Save()
}

# ─── Punto de Entrada ───────────────────────────────────────────
Show-Banner

if ($Uninstall) {
    Uninstall-Application
} else {
    Test-Prerequisites
    Install-Application
}