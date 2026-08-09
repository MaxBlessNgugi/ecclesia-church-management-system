; ECCLESIA Church Management System - NSIS Custom Script
; This script adds custom behavior to the Windows installer

!include "MUI2.nsh"

; Custom page for choosing data directory (optional)
; Uncomment to enable custom data location selection
; Page custom onDataDirPageCreate onDataDirPageLeave
; Page components
; Page directory
; Page instfiles

Function onDataDirPageCreate
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 12u "ECCLESIA stores data in your user folder by default:"
  Pop $0

  ${NSD_CreateLabel} 0 15u 100% 12u "$APPDATA\ECCLESIA"
  Pop $0

  ${NSD_CreateLabel} 0 35u 100% 12u "To use a custom location, create a file named 'ecclesia-data-path.txt'"
  Pop $0

  ${NSD_CreateLabel} 0 47u 100% 12u "in the installation folder with the desired path."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function onDataDirPageLeave
FunctionEnd

; Custom uninstaller section
Section "Uninstall"
  ; Remove the data directory option (comment out to keep user data)
  ; RMDir /r "$APPDATA\ECCLESIA"
SectionEnd