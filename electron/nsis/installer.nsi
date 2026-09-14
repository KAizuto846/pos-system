; POS System - NSIS Installer

!define PRODUCT_NAME "POS System"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "KAizuto846"
!define PRODUCT_WEB_SITE "https://github.com/KAizuto846/pos-system"
!define APP_ID "com.possystem.app"
!define UNINSTALLER_NAME "uninstall.exe"

RequestExecutionLevel admin
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME}"
InstallDirRegKey HKLM "Software\${PRODUCT_NAME}" ""

ShowInstDetails show
ShowUnInstDetails show

Name "${PRODUCT_NAME}"
OutFile "dist-electron\POS-System-Setup-${PRODUCT_VERSION}.exe"
InstallIcon "public\icons\icon-512.ico"
UninstallIcon "public\icons\icon-512.ico"

LicenseData "LICENSE"
LicenseText "Licencia MIT - Por favor lea los terminos antes de instalar."

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "nsExec.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "public\icons\icon-512.ico"
!define MUI_UNICON "public\icons\icon-512.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "public\icons\installer-header.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "public\icons\installer-header.bmp"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "$(^LicenseText)"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

Language "Spanish"

Section "Instalacion Principal" SEC_MAIN
    SectionIn RO
    SetOutPath $INSTDIR

    ; Copy all application files
    File /r "dist-electron\win-unpacked\*"

    ; Create uninstaller
    WriteUninstaller "$INSTDIR\${UNINSTALLER_NAME}"

    ; Registry info
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "UninstallString" "$INSTDIR\${UNINSTALLER_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "NoModify" "1"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "NoRepair" "1"
    WriteRegStr HKLM "Software\${PRODUCT_NAME}" "" $INSTDIR
SectionEnd

Section "Accesos Directos" SEC_SHORTCUTS
    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\POS System.exe" "" "$INSTDIR\POS System.exe" 0
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Desinstalar.lnk" "$INSTDIR\${UNINSTALLER_NAME}" "" "$INSTDIR\POS System.exe" 0
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\POS System.exe" "" "$INSTDIR\POS System.exe" 0
SectionEnd

; Reglas de firewall: permitir que el teléfono/cualquier equipo de la LAN
; acceda al servidor web (TCP 3000) y a la detección P2P (UDP 9876).
Section "Firewall" SEC_FIREWALL
    nsExec::ExecToLog 'netsh advfirewall firewall add rule name="POS System - Web (TCP 3000)" dir=in action=allow protocol=TCP localport=3000'
    nsExec::ExecToLog 'netsh advfirewall firewall add rule name="POS System - Discovery (UDP 9876)" dir=in action=allow protocol=UDP localport=9876'
SectionEnd

Section -Post
    WriteUninstaller "$INSTDIR\${UNINSTALLER_NAME}"
SectionEnd

Function un.onUninstSuccess
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
    DeleteRegKey HKLM "Software\${PRODUCT_NAME}"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\Desinstalar.lnk"
    RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
FunctionEnd

Section Uninstall
    nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="POS System - Web (TCP 3000)"'
    nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="POS System - Discovery (UDP 9876)"'
    RMDir /r $INSTDIR
SectionEnd
