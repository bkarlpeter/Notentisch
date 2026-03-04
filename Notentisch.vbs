Option Explicit

' Notentisch Launcher - robust mit absoluten Pfaden
Dim fso, objShell, scriptDir, setupPath, batPath, markerPath, exitCode
Set fso = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
setupPath = fso.BuildPath(scriptDir, "setup_notentisch.ps1")
batPath = fso.BuildPath(scriptDir, "Notentisch.bat")
markerPath = fso.BuildPath(scriptDir, ".setup_notentisch_done")

objShell.CurrentDirectory = scriptDir

' Setup nur beim ersten Start ausfuehren (sichtbar, damit Eingaben/UAC funktionieren)
If fso.FileExists(setupPath) And (Not fso.FileExists(markerPath)) Then
	exitCode = objShell.Run("powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & setupPath & """", 1, True)
	On Error Resume Next
	Dim markerFile
	Set markerFile = fso.CreateTextFile(markerPath, True)
	markerFile.WriteLine "setup attempted, exitCode=" & exitCode
	markerFile.Close
	On Error GoTo 0
End If

If Not fso.FileExists(batPath) Then
	MsgBox "Notentisch.bat wurde nicht gefunden:" & vbCrLf & batPath, vbCritical, "Notentisch"
	WScript.Quit 1
End If

' App unsichtbar starten
objShell.Run "cmd.exe /c """ & batPath & """", 0, False
