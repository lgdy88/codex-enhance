Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define ROOT "..\..\.."

Name "Dex"
OutFile "${ROOT}\dist\windows\Dex-${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Dex"
InstallDirRegKey HKCU "Software\Dex" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!define MUI_ICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"
!define MUI_UNICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"

  nsExec::ExecToLog 'taskkill /IM codex-plus-plus.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM codex-plus-plus-manager.exe /F'
  Pop $0

  File "${ROOT}\dist\windows\app\codex-plus-plus.exe"
  File "${ROOT}\dist\windows\app\codex-plus-plus-manager.exe"

  Delete "$DESKTOP\Codex++ ç®¡ç†å·¥å…·.lnk"
  Delete "$SMPROGRAMS\Codex++\Codex++ ç®¡ç†å·¥å…·.lnk"
  Delete "$SMPROGRAMS\Codex++\å¸è½½ Codex++.lnk"
  Delete "$DESKTOP\Codex++.lnk"
  Delete "$DESKTOP\Codex++ 管理工具.lnk"

  CreateShortcut "$DESKTOP\Dex.lnk" "$INSTDIR\codex-plus-plus-manager.exe" "" "$INSTDIR\codex-plus-plus-manager.exe"
  CreateDirectory "$SMPROGRAMS\Dex"
  CreateShortcut "$SMPROGRAMS\Dex\Dex.lnk" "$INSTDIR\codex-plus-plus-manager.exe" "" "$INSTDIR\codex-plus-plus-manager.exe"
  CreateShortcut "$SMPROGRAMS\Dex\卸载 Dex.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\codex-plus-plus-manager.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\Dex" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dex" "DisplayName" "Dex"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dex" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dex" "Publisher" "lgdy88"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dex" "DisplayIcon" "$INSTDIR\codex-plus-plus-manager.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dex" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dex" "UninstallString" "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /IM codex-plus-plus.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM codex-plus-plus-manager.exe /F'
  Pop $0

  Delete "$DESKTOP\Codex++.lnk"
  Delete "$DESKTOP\Codex++ 管理工具.lnk"
  Delete "$DESKTOP\Codex++ ç®¡ç†å·¥å…·.lnk"
  Delete "$DESKTOP\Dex.lnk"
  Delete "$SMPROGRAMS\Codex++\Codex++.lnk"
  Delete "$SMPROGRAMS\Codex++\Codex++ 管理工具.lnk"
  Delete "$SMPROGRAMS\Codex++\Codex++ ç®¡ç†å·¥å…·.lnk"
  Delete "$SMPROGRAMS\Codex++\卸载 Codex++.lnk"
  Delete "$SMPROGRAMS\Codex++\å¸è½½ Codex++.lnk"
  RMDir "$SMPROGRAMS\Codex++"
  Delete "$SMPROGRAMS\Dex\Dex.lnk"
  Delete "$SMPROGRAMS\Dex\卸载 Dex.lnk"
  RMDir "$SMPROGRAMS\Dex"

  Delete "$INSTDIR\codex-plus-plus.exe"
  Delete "$INSTDIR\codex-plus-plus-manager.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dex"
  DeleteRegKey HKCU "Software\Dex"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Codex++"
  DeleteRegKey HKCU "Software\Codex++"
SectionEnd
