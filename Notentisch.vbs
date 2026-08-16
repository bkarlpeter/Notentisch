Option Explicit

' Notentisch Launcher - robust mit absoluten Pfaden
Dim fso, objShell, scriptDir, batPath
Set fso = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(scriptDir, "Notentisch.bat")

objShell.CurrentDirectory = scriptDir

If Not fso.FileExists(batPath) Then
	MsgBox "Notentisch.bat wurde nicht gefunden:" & vbCrLf & batPath, vbCritical, "Notentisch"
	WScript.Quit 1
End If

' App unsichtbar starten
objShell.Run "cmd.exe /c """ & batPath & """", 0, False
