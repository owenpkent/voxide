!macro customInit
  ; Bring installer to front (critical after UAC elevation — otherwise buried behind other windows)
  BringToFront

  ; Check if VoxIDE is currently running
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq VoxIDE.exe" /NH 2>nul | findstr /I "VoxIDE.exe"'
  Pop $0
  ${If} $0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "VoxIDE is currently running.$\r$\n$\r$\nClick OK to close it and continue installing, or Cancel to abort." IDOK killIt
    Abort
    killIt:
      nsExec::ExecToLog 'taskkill /F /IM "VoxIDE.exe"'
      ; Poll until the process is fully gone (up to 8 s) so file handles are
      ; released before the upgrade uninstaller runs.
      StrCpy $9 0
      pollExit:
        Sleep 1000
        IntOp $9 $9 + 1
        ${If} $9 >= 8
          Goto pollDone
        ${EndIf}
        nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq VoxIDE.exe" /NH 2>nul | findstr /I "VoxIDE.exe"'
        Pop $0
        ${If} $0 == 0
          Goto pollExit
        ${EndIf}
      pollDone:
  ${EndIf}
!macroend

!macro customInstall
  ; Check per-user install (HKCU) in a different directory
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "UninstallString"
  ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} $2 != ""
  ${AndIf} $2 != "$INSTDIR"
  ${AndIf} $2 != "$INSTDIR\"
    ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayVersion"
    MessageBox MB_YESNO|MB_ICONQUESTION "A previous version of VoxIDE (v$1) was found at:$\r$\n$2$\r$\n$\r$\nWould you like to remove it?$\r$\n(Recommended: Yes)" IDYES removePrevHKCU IDNO skipPrevHKCU
    removePrevHKCU:
      ExecWait '"$0" /S'
      Sleep 2000
    skipPrevHKCU:
  ${EndIf}

  ; Check per-machine install (HKLM) in a different directory
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "UninstallString"
  ReadRegStr $2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} $2 != ""
  ${AndIf} $2 != "$INSTDIR"
  ${AndIf} $2 != "$INSTDIR\"
    ReadRegStr $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayVersion"
    MessageBox MB_YESNO|MB_ICONQUESTION "A previous system-wide installation of VoxIDE (v$1) was found at:$\r$\n$2$\r$\n$\r$\nWould you like to remove it?$\r$\n(Recommended: Yes)" IDYES removePrevHKLM IDNO skipPrevHKLM
    removePrevHKLM:
      ExecWait '"$0" /S'
      Sleep 2000
    skipPrevHKLM:
  ${EndIf}

  ; --- Force create shortcuts ---
  CreateDirectory "$SMPROGRAMS\VoxIDE"
  CreateShortCut "$SMPROGRAMS\VoxIDE\VoxIDE.lnk" "$INSTDIR\VoxIDE.exe" "" "$INSTDIR\VoxIDE.exe" 0
  CreateShortCut "$DESKTOP\VoxIDE.lnk" "$INSTDIR\VoxIDE.exe" "" "$INSTDIR\VoxIDE.exe" 0
!macroend

!macro customUnInstall
  ; Clean up shortcuts on uninstall
  Delete "$DESKTOP\VoxIDE.lnk"
  Delete "$SMPROGRAMS\VoxIDE\VoxIDE.lnk"
  RMDir "$SMPROGRAMS\VoxIDE"
!macroend
