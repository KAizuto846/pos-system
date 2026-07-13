; POS System - Custom NSIS Installer with Configuration Wizard
; Professional Windows installer with initial setup wizard

!define PRODUCT_NAME "POS System"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "KAizuto846"
!define PRODUCT_WEB_SITE "https://github.com/KAizuto846/pos-system"

!define APP_ID "com.possystem.app"
!define UNINSTALLER_NAME "uninstall.exe"
!define CONFIG_DIR "$APPDATA\${PRODUCT_NAME}"

RequestExecutionLevel admin
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME}"
InstallDirRegKey HKLM "Software\${PRODUCT_NAME}" ""

ShowInstDetails show
ShowUnInstDetails show

Name "${PRODUCT_NAME}"
OutFile "dist-electron\POS-System-Setup-${PRODUCT_VERSION}.exe"
InstallIcon "${NSISDIR}\Contrib\Graphics\Icons\install.ico"
UninstallIcon "${NSISDIR}\Contrib\Graphics\Icons\uninstall.ico"

LicenseData "LICENSE"
LicenseText "Licencia MIT - Por favor lea los terminos antes de instalar."

ComponentText "Instalar ${PRODUCT_NAME}!"
SubCaption " "

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; Modern UI Settings
!define MUI_ABORTWARNING
!define MUI_ICON "public\icons\icon-512.ico"
!define MUI_UNICON "public\icons\icon-512.ico"

!define MUI_WELCOMEFINISHPAGE_BITMAP "public\icons\installer-header.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "public\icons\installer-header.bmp"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "$(^LicenseText)"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

Language "Spanish" "Spanish.nlf"
Language "English" "English.nlf"

; ─── Variables ──────────────────────────────────────────────
Var BusinessName
Var DeviceName
Var ServerMode
Var ServerPort
Var AutoStart

Function .onInit
    ; Initialize variables
    StrCpy $BusinessName "Mi Negocio"
    StrCpy $DeviceName "$COMPUTERNAME"
    StrCpy $ServerMode "server"
    StrCpy $ServerPort "3000"
    StrCpy $AutoStart "1"

    ; Check if already installed
    ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayName"
    StrCmp $0 "" not_installed
    goto check_reinstall

    not_installed:
    goto done

    check_reinstall:
    MessageBox MB_YESNO|MB_ICONQUESTION "${PRODUCT_NAME} ya esta instalado. Desea reinstallar?" IDYES done
    Abort

    done:
FunctionEnd

; ─── Configuration Page ─────────────────────────────────────
Function ShowConfigPage
    ; Custom configuration page
    nsDialogs::Create 1018
    Pop $0

    ${If} $0 == error
        Abort
    ${EndIf}

    ; Business Name
    ${NSD_CreateLabel} 0 0 100% 20u "Nombre del Negocio:"
    Pop $0

    ${NSD_CreateText} 0 20u 100% 20u "$BusinessName"
    Pop $BusinessName

    ; Device Name
    ${NSD_CreateLabel} 0 50u 100% 20u "Nombre del Dispositivo:"
    Pop $0

    ${NSD_CreateText} 0 70u 100% 20u "$DeviceName"
    Pop $DeviceName

    ; Server Mode
    ${NSD_CreateLabel} 0 100u 100% 20u "Modo de Operacion:"
    Pop $0

    ${NSD_CreateRadioButton} 0 120u 100% 20u "Servidor (ejecuta la base de datos local)"
    Pop $ServerMode

    ${NSD_CreateRadioButton} 0 140u 100% 20u "Cliente (se conecta a otro servidor)"
    Pop $0

    ${NSD_CreateRadioButton} 0 160u 100% 20u "Automatico (detecta automaticamente)"
    Pop $0

    ; Server Port
    ${NSD_CreateLabel} 0 190u 100% 20u "Puerto del Servidor:"
    Pop $0

    ${NSD_CreateText} 0 210u 100% 20u "$ServerPort"
    Pop $ServerPort

    ; Auto Start
    ${NSD_CreateCheckBox} 0 240u 100% 20u "Iniciar con Windows"
    Pop $AutoStart

    nsDialogs::Show
FunctionEnd

Function .onSelChange
    ; Update mode radio buttons based on selection
FunctionEnd

Function .onNext
    ; Validate and save configuration
    ${NSD_GetText} $BusinessName $BusinessName
    ${NSD_GetText} $DeviceName $DeviceName
    ${NSD_GetText} $ServerPort $ServerPort

    ; Validate port
    StrCmp $ServerPort "" 0 port_ok
    MessageBox MB_OK|MB_ICONEXCLAMATION "Por favor ingrese un puerto valido."
    Abort

    port_ok:
    ; Validate business name
    StrCmp $BusinessName "" 0 name_ok
    MessageBox MB_OK|MB_ICONEXCLAMATION "Por favor ingrese el nombre del negocio."
    Abort

    name_ok:
FunctionEnd

; ─── Installation Sections ──────────────────────────────────
Section "Instalacion Principal" SEC_MAIN
    SectionIn RO
    SetOutPath $INSTDIR

    ; Copy all application files
    File /r "dist-electron\win-unpacked\*"

    ; Create uninstaller
    WriteUninstaller "$INSTDIR\${UNINSTALLER_NAME}"

    ; Create configuration directory
    CreateDirectory "${CONFIG_DIR}"

    ; Save configuration file
    FileOpen $0 "${CONFIG_DIR}\config.json" w
    FileWrite $0 '{$\n'
    FileWrite $0 '  "businessName": "$BusinessName",$\n'
    FileWrite $0 '  "deviceName": "$DeviceName",$\n'
    FileWrite $0 '  "mode": "$ServerMode",$\n'
    FileWrite $0 '  "serverPort": $ServerPort,$\n'
    FileWrite $0 '  "serverIP": ""$\n'
    FileWrite $0 '}$\n'
    FileClose $0

    ; Write uninstall info to registry
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "UninstallString" "$INSTDIR\${UNINSTALLER_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "NoModify" "1"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "NoRepair" "1"
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "EstimatedSize" 0

    ; Write install location for reference
    WriteRegStr HKLM "Software\${PRODUCT_NAME}" "" $INSTDIR
    WriteRegStr HKLM "Software\${PRODUCT_NAME}" "BusinessName" "$BusinessName"
    WriteRegStr HKLM "Software\${PRODUCT_NAME}" "DeviceName" "$DeviceName"
SectionEnd

Section "Accesos Directos" SEC_SHORTCUTS
    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\POS System.exe" "" "$INSTDIR\POS System.exe" 0
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Desinstalar ${PRODUCT_NAME}.lnk" "$INSTDIR\${UNINSTALLER_NAME}" "" "$INSTDIR\POS System.exe" 0

    ; Desktop shortcut
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\POS System.exe" "" "$INSTDIR\POS System.exe" 0
SectionEnd

Section "Inicio Automatico" SEC_AUTOSTART
    ${If} $AutoStart == "1"
        ; Create scheduled task for auto-start
        nsExec::ExecToLog 'schtasks /create /tn "POSSystemAutoStart" /tr "$INSTDIR\POS System.exe --hidden" /sc onlogon /rl highest /f'
    ${EndIf}
SectionEnd

Section -Post
    WriteUninstaller "$INSTDIR\${UNINSTALLER_NAME}"
SectionEnd

Function un.onUninstSuccess
    ; Remove registry entries
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
    DeleteRegKey HKLM "Software\${PRODUCT_NAME}"

    ; Remove scheduled task
    nsExec::ExecToLog 'schtasks /delete /tn "POSSystemAutoStart" /f'

    ; Remove Start Menu shortcuts
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\Desinstalar ${PRODUCT_NAME}.lnk"
    RMDir "$SMPROGRAMS\${PRODUCT_NAME}"

    ; Remove Desktop shortcut
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"

    ; Remove configuration directory
    RMDir /r "${CONFIG_DIR}"
FunctionEnd

Section Uninstall
    ; Remove all files
    RMDir /r $INSTDIR
SectionEnd
