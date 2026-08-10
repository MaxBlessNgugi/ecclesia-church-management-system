; ECCLESIA Church Management System - NSIS Custom Script
; -----------------------------------------------------------------------------
; Adds a "Getting Started" page to the installer wizard so a first-time user
; knows exactly what happens next: launch the app, create the parish
; administrator on first launch, and where the data lives.
;
; NOTE: The app stores parish data in %APPDATA%\ECCLESIA by design. There is
; deliberately NO uninstaller code here that removes it — uninstalling the
; software must NEVER delete parish data. Only add data removal when the
; product explicitly offers it.
; -----------------------------------------------------------------------------

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  !macro customWelcomePage
    ; Custom "Getting Started" page shown right after the welcome page.
    Page custom pgGettingStartedShow pgGettingStartedLeave

    Function pgGettingStartedShow
      !insertmacro MUI_HEADER_TEXT "Getting Started" "What happens next"
      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 0 100% 12u "Thank you for installing ECCLESIA Church Management System."
      Pop $0
      ${NSD_CreateLabel} 0 14u 100% 12u "After the installer finishes:"
      Pop $0
      ${NSD_CreateLabel} 12u 28u 100% 10u "-  Launch ECCLESIA from the desktop or Start Menu shortcut."
      Pop $0
      ${NSD_CreateLabel} 12u 40u 100% 10u "-  On first launch you will create the parish administrator:"
      Pop $0
      ${NSD_CreateLabel} 24u 52u 100% 10u "   your name, an email address, and a password you choose."
      Pop $0
      ${NSD_CreateLabel} 12u 64u 100% 10u "-  Use those credentials every time you sign in."
      Pop $0
      ${NSD_CreateLabel} 0 86u 100% 12u "Parish data is stored on this PC and is never deleted when"
      Pop $0
      ${NSD_CreateLabel} 0 98u 100% 12u "the software is uninstalled."
      Pop $0

      nsDialogs::Show
    FunctionEnd

    Function pgGettingStartedLeave
    FunctionEnd
  !macroend
!endif
