; ECCLESIA Church Management System - NSIS Custom Script
; This script adds custom behavior to the Windows installer.
;
; NOTE: The app stores parish data in %APPDATA%\ECCLESIA by design. There is
; deliberately NO uninstaller code here that removes it — uninstalling the
; software must NEVER delete parish data. Only add data removal when the
; product explicitly offers it.
