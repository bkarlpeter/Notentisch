' Digitaler Notentisch - VBS Starter
' Alternative zur .bat für bessere Windows-Kompatibilität

Dim objShell, objFSO, strProjectDir, strURL, intPort
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Projekt-Pfad ermitteln (Verzeichnis der VBS-Datei)
strProjectDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Wechsle zum OneDrive-Root damit Server auf alle Dateien zugreifen kann
objShell.CurrentDirectory = "C:\Users\User\OneDrive"

' Port definieren
intPort = 8000
strURL = "http://localhost:" & intPort & "/lapdaten%20%28E%29/Daten/Projekt%20notentisch/board.html"

' Prüfe ob Python installiert ist
On Error Resume Next
objShell.Exec "python --version"
If Err.Number <> 0 Then
    MsgBox "Fehler: Python nicht installiert!" & vbCrLf & vbCrLf & _
           "Bitte Python von python.org installieren." & vbCrLf & _
           "Stelle sicher, dass 'Add Python to PATH' aktiviert ist.", _
           vbCritical, "Digitaler Notentisch - Fehler"
    WScript.Quit 1
End If
On Error GoTo 0

' Starte Python Server im Hintergrund (vom OneDrive-Root aus)
objShell.CurrentDirectory = "C:\Users\User\OneDrive"
Set objExec = objShell.Exec("python -m http.server " & intPort)

' Warte kurz, damit Server startet
WScript.Sleep 2000

' Öffne im Standard-Browser
objShell.Run strURL, 1, False

' Info-Meldung
MsgBox "Digitaler Notentisch laeuft!" & vbCrLf & vbCrLf & _
       "URL: " & strURL & vbCrLf & _
       "Projekt: " & strProjectDir & vbCrLf & vbCrLf & _
       "Der Server laeuft im Hintergrund." & vbCrLf & _
       "Zum Beenden: Python-Fenster schließen oder Ctrl+C.", _
       vbInformation, "Digitaler Notentisch"

WScript.Quit 0
