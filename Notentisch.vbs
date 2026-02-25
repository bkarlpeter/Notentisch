
' Notentisch Launcher - startet zuerst das Setup, dann die App unsichtbar
Set fso = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

If fso.FileExists("setup_notentisch.ps1") Then
	' PowerShell-Setup unsichtbar und mit Adminrechten starten
	objShell.Run "powershell -ExecutionPolicy Bypass -NoProfile -File """ & fso.GetAbsolutePathName("setup_notentisch.ps1") & """", 0, True
End If

' Danach wie gewohnt die App starten
objShell.Run "cmd /c Notentisch.bat", 0
