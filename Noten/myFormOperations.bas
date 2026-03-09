Attribute VB_Name = "myFormOperations"
'===========================================================
' Modul: myFormOperations
' Zentrale Utility-Funktionen f�r Status, Sortierung, Settings
'===========================================================

Option Compare Database
Option Explicit

'===========================================================
' SECTION 0: SETTINGS-HELPER
'===========================================================

'--- Stellt sicher, dass Einstellungen GENAU EINE Zeile hat ---
Public Function EnsureSingleSettingsRow() As DAO.Recordset
    Dim rs As DAO.Recordset

    Set rs = CurrentDb.OpenRecordset("SELECT * FROM Einstellungen", dbOpenDynaset)

    If rs.EOF Then
        rs.AddNew
        rs.Update
        rs.Requery
    End If

    rs.MoveFirst
    Set EnsureSingleSettingsRow = rs
End Function

'--- Key aus Formnamen: "4-3 Notentisch" -> "4-3" ---
Public Function GetKeyFromFormName(frm As Form) As String
    Dim fullName As String
    Dim pos As Long

    fullName = frm.Name
    pos = InStr(fullName, " ")

    If pos > 0 Then
        GetKeyFromFormName = Left(fullName, pos - 1)
    Else
        GetKeyFromFormName = fullName
    End If
End Function

'--- Feldname in Einstellungen erzeugen ---
Public Function BuildSettingsField(frm As Form, prefix As String) As String
    BuildSettingsField = prefix & GetKeyFromFormName(frm)
End Function

'--- Settings lesen ---
Public Function GetSettingValue(frm As Form, prefix As String, _
                                Optional defaultValue As Long = 1) As Long
    Dim rs As DAO.Recordset
    Dim fieldName As String
    Dim v As Variant

    fieldName = BuildSettingsField(frm, prefix)
    Set rs = EnsureSingleSettingsRow()

    On Error Resume Next
    v = rs.Fields(fieldName).Value
    On Error GoTo 0

    If IsNull(v) Or v = "" Then
        GetSettingValue = defaultValue
    Else
        GetSettingValue = CLng(v)
    End If

    rs.Close
End Function

'--- Settings speichern ---
Public Sub SaveSettingValue(frm As Form, prefix As String, Wert As Long)
    Dim rs As DAO.Recordset
    Dim fieldName As String

    fieldName = BuildSettingsField(frm, prefix)
    Set rs = EnsureSingleSettingsRow()

    rs.Edit
    rs.Fields(fieldName).Value = Wert
    rs.Update
    rs.Close
End Sub

Private Function GetNotentischXmlPath() As String
    Dim p As String
    p = Trim$(Nz(DLookup("LocNotenTisch", "Einstellungen"), ""))
    GetNotentischXmlPath = ResolveNotentischXmlPath(p)
End Function

Private Function NormalizeNotentischXmlPath(ByVal p As Variant) As String
    p = Trim$(Nz(p, ""))
    If Len(p) = 0 Then Exit Function

    If Len(p) >= 2 And Left$(p, 1) = Chr$(34) And Right$(p, 1) = Chr$(34) Then
        p = Mid$(p, 2, Len(p) - 2)
    End If

    p = Replace(p, "/", "\")

    If Left$(p, 2) = ".\" Then p = Mid$(p, 3)

    ' doppelte Fragmente bereinigen
    Do While InStr(1, LCase$(p), "\noten\noten\", vbTextCompare) > 0
        p = Replace(p, "\Noten\Noten\", "\Noten\", 1, -1, vbTextCompare)
    Loop
    Do While InStr(1, LCase$(p), "\notentisch.xml\notentisch.xml", vbTextCompare) > 0
        p = Replace(p, "\NotenTisch.xml\NotenTisch.xml", "\NotenTisch.xml", 1, -1, vbTextCompare)
    Loop

    If LCase$(Right$(p, 14)) = "notentisch.xml" Then
        NormalizeNotentischXmlPath = p
    Else
        If Right$(p, 1) <> "\" Then p = p & "\"
        NormalizeNotentischXmlPath = p & "NotenTisch.xml"
    End If
End Function

Private Function ResolveNotentischXmlPath(ByVal rawPath As Variant) As String
    Dim p As String
    Dim candProject As String
    Dim candOneDrive As String
    Dim oneDriveRoot As String
    Dim projectRoot As String

    p = NormalizeNotentischXmlPath(rawPath)
    If Len(p) = 0 Then Exit Function

    ' Absoluter Pfad oder UNC: direkt verwenden
    If InStr(1, p, ":", vbTextCompare) > 0 Or Left$(p, 2) = "\\" Then
        ResolveNotentischXmlPath = p
        Exit Function
    End If

    ' Relativer Pfad: zuerst relativ zur Access-Projektdatei versuchen
    projectRoot = Trim$(Nz(CurrentProject.Path, ""))
    If Len(projectRoot) > 0 Then
        candProject = NormalizeNotentischXmlPath(projectRoot & "\" & p)
    End If
    If PathOrParentExists(candProject) Then
        ResolveNotentischXmlPath = candProject
        Exit Function
    End If

    ' Danach relativ zum OneDrive-Root
    oneDriveRoot = Trim$(Environ$("OneDrive"))
    If Len(oneDriveRoot) > 0 Then
        If Right$(oneDriveRoot, 1) <> "\" Then oneDriveRoot = oneDriveRoot & "\"
        candOneDrive = NormalizeNotentischXmlPath(oneDriveRoot & p)
        If PathOrParentExists(candOneDrive) Then
            ResolveNotentischXmlPath = candOneDrive
            Exit Function
        End If
    End If

    ' Fallback: Projekt-Variante zurückgeben
    If Len(candProject) > 0 Then
        ResolveNotentischXmlPath = candProject
    Else
        ResolveNotentischXmlPath = p
    End If
End Function

Private Function PathOrParentExists(ByVal filePath As String) As Boolean
    Dim fso As Object
    Dim folderPath As String

    If Len(filePath) = 0 Then Exit Function

    If Dir$(filePath, vbNormal) <> "" Then
        PathOrParentExists = True
        Exit Function
    End If

    If InStrRev(filePath, "\") = 0 Then Exit Function
    folderPath = Left$(filePath, InStrRev(filePath, "\") - 1)

    Set fso = CreateObject("Scripting.FileSystemObject")
    PathOrParentExists = fso.FolderExists(folderPath)
End Function

'===========================================================
' SECTION 1: STATE / FARBE
'===========================================================

Public Function GetStateFilter(ByVal stateID As Long) As String
    GetStateFilter = Nz(DLookup("Status", "ArbeitsStatii", "stateID=" & stateID), "")
End Function

Public Function GetStateColor(ByVal stateID As Long) As String
    Dim s As String
    s = Nz(DLookup("Formcolor", "ArbeitsStatii", "stateID=" & stateID), "")
    If Len(s) = 0 Then s = "#FFFFFF"
    GetStateColor = s
End Function

Public Function GetColorFromStatus(strState As String) As Long
    Dim strHex As String
    Dim crit As String

    crit = "Status='" & Replace(strState, "'", "''") & "'"
    strHex = Nz(DLookup("Formcolor", "ArbeitsStatii", crit), "")

    ' Wenn kein Treffer: auch �ber ArbeitsStatus versuchen
    If Len(strHex) = 0 Then
        crit = "ArbeitsStatus='" & Replace(strState, "'", "''") & "'"
        strHex = Nz(DLookup("Formcolor", "ArbeitsStatii", crit), "")
    End If

    If Len(strHex) = 0 Then
        GetColorFromStatus = RGB(220, 220, 220)
    Else
        GetColorFromStatus = HexToLongColor(strHex)
    End If
End Function


Public Function HexToLongColor(hexColor As String) As Long
    Dim r As Long, g As Long, b As Long

    If Left(hexColor, 1) = "#" Then hexColor = Mid(hexColor, 2)
    If Len(hexColor) <> 6 Then
        HexToLongColor = RGB(255, 255, 255)
        Exit Function
    End If

    r = CLng("&H" & Mid(hexColor, 1, 2))
    g = CLng("&H" & Mid(hexColor, 3, 2))
    b = CLng("&H" & Mid(hexColor, 5, 2))

    HexToLongColor = RGB(r, g, b)
End Function

'===========================================================
' SECTION 2: STATE HANDLING (Round-Robin)
'===========================================================

Public Function NextStateValue(frm As Form) As Long
    Dim v As Long
    v = GetSettingValue(frm, "filter", 1)
    v = v + 1
    If v > 6 Then v = 1
    SaveSettingValue frm, "filter", v
    NextStateValue = v
End Function

'===========================================================
' SECTION 3: FORM OPERATIONS (Filter, Farben, Sort)
'===========================================================
Public Sub ApplyStateVisualsOnly(frm As Form)
' name und farbe gem�ss togglebtn setzen
    Dim lngColor As Long
    Dim statusName As String

    statusName = Nz(frm!ArbeitsStatus.Value, "")
    lngColor = GetColorFromStatus(statusName)

    On Error Resume Next
    frm!cmdShowState.BackColor = lngColor
    frm!Titel.BackColor = lngColor
End Sub

Public Sub ApplyStateFilter(frm As Form)
    Dim lngState As Long
    Dim strFilter As String
    Dim lngColor As Long

    ' 1. State weiterschalten
    lngState = NextStateValue(frm)

    ' 2. Statusname holen
    strFilter = GetStateFilter(lngState)
    strFilter = Replace(strFilter, "'", "''")

    ' 3. Filter setzen
    If Len(strFilter) > 0 Then
        frm.Filter = "[ArbeitsStatus]='" & strFilter & "'"
        frm.FilterOn = True
    Else
        frm.FilterOn = False
    End If

    ' 4. Farbe aus stateID holen
    lngColor = GetColorFromStateID(lngState)

    ' 5. Toggle aktualisieren
    frm!cmdShowState.BackColor = lngColor
    frm!cmdShowState.Caption = strFilter

    ' 6. Detailbereich aktualisieren
    frm!Titel.BackColor = lngColor
End Sub

Public Sub ColorDetailRow(frm As Form)

    Dim statusName As String
    Dim lngColor As Long

    On Error GoTo Ende

    statusName = Nz(frm!ArbeitsStatus.Value, "")
    If statusName = "" Then Exit Sub

    lngColor = GetColorFromStatus(statusName)

    ' Alle Felder im Detailbereich f�rben:
    frm!Titel.BackColor = lngColor
    ' Falls du mehr Felder hast, hier erg�nzen:
    ' frm!Komponist.BackColor = lngColor
    ' frm!Kategorie.BackColor = lngColor

Ende:
End Sub

Public Sub ButtonShowState(frm As Form)

    Dim stateID As Long
    Dim statusName As String
    Dim lngColor As Long

    On Error GoTo Ende

    ' 1. Gespeicherten Filterzustand laden (z. B. filter4-4)
    stateID = GetSettingValue(frm, "filter", 1)

    ' 2. Statusname aus stateID holen
    statusName = GetStatusFromStateID(stateID)

    ' 3. Farbe aus stateID holen
    lngColor = GetColorFromStateID(stateID)

    ' 4. Toggle aktualisieren
    frm!cmdShowState.Caption = statusName
    frm!cmdShowState.BackColor = lngColor

    ' 5. Detailbereich aktualisieren (Titel)
    frm!Titel.BackColor = lngColor

Ende:
End Sub

'------------------- Sortier-Settings ----------------------

Public Function NextSortValue(frm As Form) As Long
    Dim v As Long
    v = GetSettingValue(frm, "sort", 1)
    v = v + 1
    If v > 3 Then v = 1
    SaveSettingValue frm, "sort", v
    NextSortValue = v
End Function

Public Function GetSortValue(frm As Form, Optional defaultValue As Long = 1) As Long
    GetSortValue = GetSettingValue(frm, "sort", defaultValue)
End Function

Public Sub ApplySort(frm As Form)
    Dim lngSort As Long
    Dim hasDates As Boolean

    lngSort = GetSortValue(frm, 1)
    hasDates = (DCount("*", "Notentitel", "zuletztgespielt Is Not Null") > 0)

    If Not hasDates Then
        frm.OrderBy = "Titel"
        frm.OrderByOn = True
        Select Case lngSort
            Case 1: frm!cmdSort.Caption = "Titel"
            Case 2, 3: frm!cmdSort.Caption = "Eingabe"
        End Select
        Exit Sub
    End If

    Select Case lngSort
        Case 1
            frm.OrderBy = "Titel"
            frm.OrderByOn = True
            frm!cmdSort.Caption = "Titel"
        Case 2
            frm.OrderBy = "zuletztgespielt DESC"
            frm.OrderByOn = True
            frm!cmdSort.Caption = "Gespielt -"
        Case 3
            frm.OrderBy = "zuletztgespielt ASC"
            frm.OrderByOn = True
            frm!cmdSort.Caption = "Gespielt +"
    End Select
End Sub

Public Sub ApplyGescannedFilterToSubforms(frmMain As Form, ByVal bOn As Boolean)

    Dim ctl As Control
    Dim sfm As Form
    Dim baseFilter As String
    Dim newFilter As String

    For Each ctl In frmMain.Controls
        If ctl.ControlType = acSubform Then

            ' Nur 4-Formulare ber�cksichtigen
            If Left$(ctl.Name, 2) = "4-" Then

                Set sfm = ctl.Form

                ' Basisfilter aus Tag holen (ArbeitsStatus etc.)
                baseFilter = sfm.Tag

                If bOn Then
                    ' gescannt = True zus�tzlich
                    If baseFilter <> "" Then
                        newFilter = baseFilter & " AND gescannt = True"
                    Else
                        newFilter = "gescannt = True"
                    End If
                    sfm.Filter = newFilter
                    sfm.FilterOn = True
                Else
                    ' Nur Basisfilter wiederherstellen
                    sfm.Filter = baseFilter
                    sfm.FilterOn = (baseFilter <> "")
                End If

            End If
        End If
    Next ctl

End Sub


'===========================================================
' SECTION 4: STATEID / STATUS / SHORTNAME / FARBE
'===========================================================

Public Function GetStateIDFromStatus(statusName As String) As Long
    Dim id As Variant

    id = DLookup("stateID", "ArbeitsStatii", _
                 "Status='" & Replace(statusName, "'", "''") & "'")
    If Not IsNull(id) Then
        GetStateIDFromStatus = id
        Exit Function
    End If

    id = DLookup("stateID", "ArbeitsStatii", _
                 "Status='" & Replace(statusName, "'", "''") & "'")
    If Not IsNull(id) Then
        GetStateIDFromStatus = id
        Exit Function
    End If

    GetStateIDFromStatus = 0
End Function

Public Function GetStatusFromStateID(id As Long) As String
    GetStatusFromStateID = Nz(DLookup("Status", "ArbeitsStatii", "stateID=" & id), "")
End Function

Public Function GetShortNameFromStateID(id As Long) As String
    GetShortNameFromStateID = Nz(DLookup("ShortName", "ArbeitsStatii", "stateID=" & id), "")
End Function

Public Function GetColorFromStateID(id As Long) As Long
    Dim hexColor As String
    Dim r As Long, g As Long, b As Long

    hexColor = Nz(DLookup("FormColor", "ArbeitsStatii", "stateID=" & id), "")
    If hexColor = "" Then
        GetColorFromStateID = vbWhite
        Exit Function
    End If

    If Left(hexColor, 1) = "#" Then hexColor = Mid(hexColor, 2)

    r = CLng("&H" & Mid(hexColor, 1, 2))
    g = CLng("&H" & Mid(hexColor, 3, 2))
    b = CLng("&H" & Mid(hexColor, 5, 2))

    GetColorFromStateID = RGB(r, g, b)
End Function

Public Sub SetToggleFromFilter(sf As Form, stateID As Long)
    Dim shortName As String
    Dim color As Long

    shortName = GetShortNameFromStateID(stateID)
    color = GetColorFromStateID(stateID)

    On Error Resume Next
    sf!cmdShowState.Caption = shortName
    sf!cmdShowState.BackColor = color
End Sub

Public Sub SetToggleFromStatus(sf As Form, stateID As Long)
    Dim statusName As String
    Dim color As Long

    statusName = GetStatusFromStateID(stateID)
    color = GetColorFromStateID(stateID)

    On Error Resume Next
    sf!cmdShowState.Caption = statusName
    sf!cmdShowState.BackColor = color
End Sub
'===========================================================
' SECTION 5: form configuration
'===========================================================
Public Sub SaveFormPosition(frm As Form)

    Dim rs As DAO.Recordset
    Dim sql As String
    Dim fName As String

    fName = frm.Name

    sql = "SELECT * FROM Konfiguration WHERE FormName='" & fName & "'"
    Set rs = CurrentDb.OpenRecordset(sql, dbOpenDynaset)

    If rs.EOF Then
        rs.AddNew
        rs!FormName = fName
    Else
        rs.Edit
    End If

    rs!PosLeft = frm.WindowLeft
    rs!PosTop = frm.WindowTop
    rs!PosWidth = frm.WindowWidth
    rs!PosHeight = frm.WindowHeight

    rs.Update
    rs.Close
End Sub

Public Sub RestoreFormPosition(frm As Form)

    Dim rs As DAO.Recordset
    Dim sql As String
    Dim fName As String

    fName = frm.Name

    sql = "SELECT * FROM Konfiguration WHERE FormName='" & fName & "'"
    Set rs = CurrentDb.OpenRecordset(sql, dbOpenDynaset)

    If Not rs.EOF Then
        frm.Move rs!PosLeft, rs!PosTop, rs!PosWidth, rs!PosHeight
    End If

    rs.Close
End Sub
'===========================================================
' 6. EXPORT / IMPORT FUNKTIONEN: Austausch mit NotenTisch online
'===========================================================

Private Function GetNotenFolderFromSettings() As String
    Dim root As String, rel As String, p As String
    root = Trim$(Environ$("OneDrive"))
    ' relativ mit Notfall l�sung:
    rel = Trim$(Nz(DLookup("LocNotenTisch", "Einstellungen"), "myMusic\Notentisch\Noten"))
    If Left$(rel, 2) = ".\" Then rel = Mid$(rel, 3)
    If Right$(root, 1) <> "\" Then root = root & "\"
    p = root & rel
    If Right$(p, 1) <> "\" Then p = p & "\"
    GetNotenFolderFromSettings = p
End Function
'-----------------------------------------------------------
' XML EXPORT: erzeugt NotenTisch.xml direkt aus Tabelle/Abfrage NotenTisch
'-----------------------------------------------------------
Public Sub ExportNotenTischXML(sFull As String)
'exportiert Abfrage NotenTisch in das Verzeichnis wie angegebe
    On Error GoTo Err_Handler

    Dim fso As Object
    Dim tempPath As String
    Dim hasOldXml As Boolean

    Set fso = CreateObject("Scripting.FileSystemObject")
    tempPath = sFull & ".tmp"
    hasOldXml = (Dir$(sFull, vbNormal) <> "")

    If Dir$(tempPath, vbNormal) <> "" Then
        fso.DeleteFile tempPath, True
    End If

    'Minimalvariante: nur das N�tigste, l�uft in allen Versionen
    Application.ExportXML _
        ObjectType:=acExportQuery, _
        DataSource:="NotenTisch", _
        DataTarget:=tempPath

    If hasOldXml Then
        PreserveCenterAnsichtFromOldXml sFull, tempPath
    End If

    If Dir$(sFull, vbNormal) <> "" Then
        fso.DeleteFile sFull, True
    End If
    fso.MoveFile tempPath, sFull

    Exit Sub

Err_Handler:
    MsgBox "Fehler beim XML-Export: " & Err.Description, vbCritical
End Sub

Private Sub PreserveCenterAnsichtFromOldXml(ByVal oldXmlPath As String, ByVal newXmlPath As String)
    On Error GoTo CleanExit

    Dim oldDoc As Object
    Dim newDoc As Object
    Dim oldNodes As Object
    Dim oldNode As Object
    Dim oldCenter As Object
    Dim newRow As Object
    Dim newCenter As Object
    Dim idText As String
    Dim idValue As Long
    Dim xpath As String

    Set oldDoc = CreateObject("MSXML2.DOMDocument.6.0")
    oldDoc.async = False
    oldDoc.validateOnParse = False
    oldDoc.resolveExternals = False
    oldDoc.SetProperty "ProhibitDTD", True
    If Not oldDoc.Load(oldXmlPath) Then Exit Sub

    Set newDoc = CreateObject("MSXML2.DOMDocument.6.0")
    newDoc.async = False
    newDoc.validateOnParse = False
    newDoc.resolveExternals = False
    newDoc.SetProperty "ProhibitDTD", True
    If Not newDoc.Load(newXmlPath) Then Exit Sub

    Set oldNodes = oldDoc.SelectNodes("/*[local-name()='dataroot']/*[local-name()='NotenTisch']")

    For Each oldNode In oldNodes
        idText = Trim$(GetNodeText(oldNode, "NotID"))
        If Len(idText) = 0 Or Not IsNumeric(idText) Then GoTo NextNode

        Set oldCenter = oldNode.SelectSingleNode("*[local-name()='CenterAnsicht']")
        If oldCenter Is Nothing Then GoTo NextNode

        idValue = CLng(idText)
        xpath = "/*[local-name()='dataroot']/*[local-name()='NotenTisch'][number(*[local-name()='NotID'])=" & idValue & "]"
        Set newRow = newDoc.SelectSingleNode(xpath)
        If newRow Is Nothing Then GoTo NextNode

        Set newCenter = newRow.SelectSingleNode("*[local-name()='CenterAnsicht']")
        If newCenter Is Nothing Then
            newRow.appendChild newDoc.importNode(oldCenter, True)
        End If

NextNode:
    Next oldNode

    newDoc.Save newXmlPath

CleanExit:
End Sub

'-----------------------------------------------------------
' XML IMPORT: liest NotenTisch.xml nicht-destruktiv in NotenTisch
' (zentral: Arbeitsstatus + zuletztgespielt; keine Komplettl�schung)
'-----------------------------------------------------------
Public Sub ImportNotenTischXML(sFull As String)
    On Error GoTo Err_Handler

    Dim xml As Object
    Dim nodes As Object
    Dim node As Object
    Dim rsTarget As DAO.Recordset
    Dim notIdText As String
    Dim NotID As Long
    Dim arbeitsStatus As String
    Dim zuletztText As String
    Dim zuletzt As Variant
    Dim statusField As String
    Dim zuletztField As String
    Dim cntInserted As Long
    Dim cntUpdated As Long
    Dim cntUnchanged As Long
    Dim cntSkipped As Long
    Dim needUpdate As Boolean
    Dim oldStatus As Variant
    Dim oldZuletzt As Variant

    sFull = ResolveNotentischXmlPath(sFull)
    If Len(sFull) = 0 Then sFull = GetNotentischXmlPath()

    If Len(sFull) = 0 Or Dir$(sFull, vbNormal) = "" Then
        MsgBox "XML-Datei nicht gefunden:" & vbCrLf & sFull, vbCritical
        Exit Sub
    End If

    Set xml = CreateObject("MSXML2.DOMDocument.6.0")
    xml.async = False
    xml.validateOnParse = False
    xml.resolveExternals = False
    xml.SetProperty "ProhibitDTD", True

    If Not xml.Load(sFull) Then
        MsgBox "XML-Parsing-Fehler:" & vbCrLf & _
               sFull & vbCrLf & _
               "Zeile " & xml.parseError.Line & ", Pos " & xml.parseError.linepos & vbCrLf & _
               xml.parseError.reason, vbCritical
        Exit Sub
    End If

    Set rsTarget = CurrentDb.OpenRecordset("NotenTisch", dbOpenDynaset)
    Set nodes = xml.SelectNodes("/*[local-name()='dataroot']/*[local-name()='NotenTisch']")

    If HasField(rsTarget, "ArbeitsStatus") Then
        statusField = "ArbeitsStatus"
    ElseIf HasField(rsTarget, "Arbeitsstatus") Then
        statusField = "Arbeitsstatus"
    End If

    If HasField(rsTarget, "zuletztgespielt") Then
        zuletztField = "zuletztgespielt"
    ElseIf HasField(rsTarget, "ZuletztGespielt") Then
        zuletztField = "ZuletztGespielt"
    End If

    If Len(statusField) = 0 And Len(zuletztField) = 0 Then
        rsTarget.Close
        MsgBox "Import abgebrochen: In NotenTisch wurden weder Feld 'Arbeitsstatus/ArbeitsStatus' noch 'zuletztgespielt/ZuletztGespielt' gefunden.", vbCritical
        Exit Sub
    End If

    For Each node In nodes
        notIdText = Trim$(GetNodeText(node, "NotID"))
        If Len(notIdText) = 0 Or Not IsNumeric(notIdText) Then
            cntSkipped = cntSkipped + 1
            GoTo NextNode
        End If

        NotID = CLng(notIdText)
        arbeitsStatus = GetNodeTextEither(node, "Arbeitsstatus", "ArbeitsStatus")
        zuletztText = Trim$(GetNodeTextEither(node, "zuletztgespielt", "ZuletztGespielt"))

        If zuletztText = "" Then
            zuletzt = Null
        ElseIf IsDate(zuletztText) Then
            zuletzt = CDate(zuletztText)
        Else
            zuletzt = Null
        End If

        rsTarget.FindFirst "NotID = " & NotID

        If rsTarget.NoMatch Then
            rsTarget.AddNew
            rsTarget!NotID = NotID
            If Len(statusField) > 0 Then
                rsTarget.Fields(statusField).Value = arbeitsStatus
            End If
            If Len(zuletztField) > 0 Then
                rsTarget.Fields(zuletztField).Value = zuletzt
            End If
            rsTarget.Update
            cntInserted = cntInserted + 1
        Else
            needUpdate = False

            If Len(statusField) > 0 Then
                oldStatus = rsTarget.Fields(statusField).Value
                If Nz(oldStatus, "") <> Nz(arbeitsStatus, "") Then
                    needUpdate = True
                End If
            End If

            If Len(zuletztField) > 0 Then
                oldZuletzt = rsTarget.Fields(zuletztField).Value
                If (IsNull(oldZuletzt) <> IsNull(zuletzt)) _
                   Or (Not IsNull(oldZuletzt) And oldZuletzt <> zuletzt) Then
                    needUpdate = True
                End If
            End If

            If needUpdate Then
                rsTarget.Edit
                If Len(statusField) > 0 Then
                    rsTarget.Fields(statusField).Value = arbeitsStatus
                End If
                If Len(zuletztField) > 0 Then
                    rsTarget.Fields(zuletztField).Value = zuletzt
                End If
                rsTarget.Update
                cntUpdated = cntUpdated + 1
            Else
                cntUnchanged = cntUnchanged + 1
            End If
        End If

NextNode:
    Next node

    rsTarget.Close

        MsgBox "Import abgeschlossen (nicht-destruktiv):" & vbCrLf & _
            "Neu: " & cntInserted & vbCrLf & _
            "Geaendert: " & cntUpdated & vbCrLf & _
            "Unveraendert: " & cntUnchanged & vbCrLf & _
            "Uebersprungen: " & cntSkipped, vbInformation
    Exit Sub


Err_Handler:
    MsgBox "Fehler beim XML-Import: " & Err.Description, vbCritical
End Sub

Private Function HasField(ByVal rs As DAO.Recordset, ByVal fieldName As String) As Boolean
    On Error Resume Next
    Dim v As Variant
    v = rs.Fields(fieldName).Name
    HasField = (Err.Number = 0)
    Err.Clear
    On Error GoTo 0
End Function

'-----------------------------------------------------------
' EXPORT BUTTON: erzeugt NotenTisch.xml im eingestellten Pfad
'-----------------------------------------------------------
Public Sub cmdExport()
    On Error GoTo Err_Handler

    Dim sPath As String
    Dim sFull As String
    Dim fso As Object

    Set fso = CreateObject("Scripting.FileSystemObject")

    '--- Voller XML-Pfad aus Einstellungen lesen
    sFull = GetNotentischXmlPath()
    If Len(sFull) = 0 Then
        MsgBox "Kein Exportpfad in Einstellungen hinterlegt.", vbExclamation
        Exit Sub
    End If

    sPath = Left$(sFull, InStrRev(sFull, "\") - 1)

    '--- Ordner pr�fen
    If Not fso.FolderExists(sPath) Then
        MsgBox "Exportverzeichnis existiert nicht oder ist nicht lokal synchronisiert:" & vbCrLf & sPath, vbCritical
        Exit Sub
    End If

    '--- XML erzeugen
    ExportNotenTischXML sFull

    MsgBox "Export erfolgreich nach:" & vbCrLf & sFull, vbInformation
    Exit Sub

Err_Handler:
    MsgBox "Fehler beim Export: " & Err.Description, vbCritical
End Sub

'-----------------------------------------------------------
' SYNC: �bertr�gt importierte Werte aus NotenTisch ? Notentitel
'-----------------------------------------------------------
Public Sub ImportBoardXML()

    On Error GoTo Err_Handler

    Dim xml As Object
    Dim node As Object
    Dim db As DAO.Database
    Dim rsChanges As DAO.Recordset
    Dim rsLocal As DAO.Recordset
    Dim xmlPath As String
    Dim basePath As String
    Dim NotID As Long
    Dim ArbeitsStatus As String
    Dim zuletzt As Variant
    Dim zuletztText As String
    Dim notIdText As String
    Dim localStatus As String
    Dim localZuletzt As Variant
    Dim cntNeu As Long
    Dim cntGeaendert As Long
    Dim cntUnveraendert As Long
    Dim cntUebersprungen As Long

    '--- XML-Pfad robust aus Einstellungen lesen
    xmlPath = GetNotentischXmlPath()

    If Len(xmlPath) = 0 Then
        MsgBox "Kein Pfad in Einstellungen (LocNotenTisch).", vbExclamation
        Exit Sub
    End If
    
    Set xml = CreateObject("MSXML2.DOMDocument.6.0")
    xml.async = False
    xml.validateOnParse = False
    xml.resolveExternals = False
    xml.SetProperty "ProhibitDTD", True
    
    If Not xml.Load(xmlPath) Then
        MsgBox "XML-Parsing-Fehler:" & vbCrLf & _
               xmlPath & vbCrLf & _
               "Zeile " & xml.parseError.Line & ", Pos " & xml.parseError.linepos & vbCrLf & _
               xml.parseError.reason, vbCritical
        Exit Sub
    End If

    Set db = CurrentDb
    db.Execute "DELETE FROM changesFromBoard;", dbFailOnError

    Set rsChanges = db.OpenRecordset("changesFromBoard", dbOpenDynaset)
    Set rsLocal = db.OpenRecordset("Notentitel", dbOpenDynaset)

    For Each node In xml.SelectNodes("/*[local-name()='dataroot']/*[local-name()='NotenTisch']")

        notIdText = Trim$(GetNodeText(node, "NotID"))
        If Len(notIdText) = 0 Or Not IsNumeric(notIdText) Then
            cntUebersprungen = cntUebersprungen + 1
            GoTo NextImportNode
        End If

        NotID = CLng(notIdText)
        ArbeitsStatus = GetNodeTextEither(node, "Arbeitsstatus", "ArbeitsStatus")

        zuletztText = Trim$(GetNodeTextEither(node, "zuletztgespielt", "ZuletztGespielt"))

        If zuletztText = "" Then
            zuletzt = Null
        ElseIf IsDate(zuletztText) Then
            zuletzt = CDate(zuletztText)
        Else
            zuletzt = Null
        End If

        rsLocal.FindFirst "NotID = " & NotID

        If rsLocal.NoMatch Then
            rsChanges.AddNew
            rsChanges!NotID = NotID
            rsChanges!ArbeitsStatus = ArbeitsStatus
            rsChanges!zuletztgespielt = zuletzt
            rsChanges.Update
            cntNeu = cntNeu + 1
        Else
            localStatus = Nz(rsLocal!ArbeitsStatus, "")
            localZuletzt = rsLocal!zuletztgespielt

            If localStatus <> ArbeitsStatus _
               Or (IsNull(localZuletzt) <> IsNull(zuletzt)) _
               Or (Not IsNull(localZuletzt) And localZuletzt <> zuletzt) Then

                rsChanges.AddNew
                rsChanges!NotID = NotID
                rsChanges!ArbeitsStatus = ArbeitsStatus
                rsChanges!zuletztgespielt = zuletzt
                rsChanges.Update
                cntGeaendert = cntGeaendert + 1
            Else
                cntUnveraendert = cntUnveraendert + 1
            End If
        End If
NextImportNode:
    Next node

    rsChanges.Close
    rsLocal.Close

            MsgBox "ImportBoardXML abgeschlossen:" & vbCrLf & _
                "Neu: " & cntNeu & vbCrLf & _
                "Geaendert: " & cntGeaendert & vbCrLf & _
                "Unveraendert: " & cntUnveraendert & vbCrLf & _
                "Uebersprungen: " & cntUebersprungen, vbInformation
    Exit Sub

Err_Handler:
    MsgBox "Fehler in ImportBoardXML: " & Err.Description, vbCritical
End Sub

'--------------------------------------------------------
Public Sub SyncBoardChanges()
'stellet
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim tgt As DAO.Recordset
    Dim cntNeu As Long
    Dim cntGeaendert As Long
    Dim cntUnveraendert As Long
    Dim oldStatus As Variant
    Dim oldZuletzt As Variant
    Dim newStatus As Variant
    Dim newZuletzt As Variant
    Dim needUpdate As Boolean

    Set db = CurrentDb
    Set rs = db.OpenRecordset("changesFromBoard", dbOpenDynaset)
    Set tgt = db.OpenRecordset("Notentitel", dbOpenDynaset)

If (rs.BOF And rs.EOF) Then
    MsgBox "Keine �nderungen zum Synchronisieren.", vbInformation
    rs.Close: tgt.Close
    Exit Sub
End If
    rs.MoveFirst
    Do Until rs.EOF

        tgt.FindFirst "NotID = " & rs!NotID

        newStatus = rs!ArbeitsStatus
        newZuletzt = rs!zuletztgespielt

        If tgt.NoMatch Then
            tgt.AddNew
            tgt!NotID = rs!NotID
            tgt!ArbeitsStatus = newStatus

            If IsNull(newZuletzt) Then
                tgt!zuletztgespielt = Null
            Else
                tgt!zuletztgespielt = newZuletzt
            End If

            tgt.Update
            cntNeu = cntNeu + 1
        Else
            oldStatus = tgt!ArbeitsStatus
            oldZuletzt = tgt!zuletztgespielt

            needUpdate = False
            If Nz(oldStatus, "") <> Nz(newStatus, "") Then
                needUpdate = True
            End If
            If (IsNull(oldZuletzt) <> IsNull(newZuletzt)) _
               Or (Not IsNull(oldZuletzt) And oldZuletzt <> newZuletzt) Then
                needUpdate = True
            End If

            If needUpdate Then
                tgt.Edit
                tgt!ArbeitsStatus = newStatus

                If IsNull(newZuletzt) Then
                    tgt!zuletztgespielt = Null
                Else
                    tgt!zuletztgespielt = newZuletzt
                End If

                tgt.Update
                cntGeaendert = cntGeaendert + 1
            Else
                cntUnveraendert = cntUnveraendert + 1
            End If
        End If
        rs.MoveNext
    Loop

    rs.Close
    tgt.Close

        MsgBox "Sync abgeschlossen:" & vbCrLf & _
            "Neu: " & cntNeu & vbCrLf & _
            "Geaendert: " & cntGeaendert & vbCrLf & _
            "Unveraendert: " & cntUnveraendert & vbCrLf & _
            "Uebersprungen: 0", vbInformation

End Sub

'-----------------------------------------------------------
' check system
'-----------------------------------------------------------

' Button-Click:
' Private Sub cmdHealthCheck_Click()
'     HealthCheckBoardSync
' End Sub

Public Sub HealthCheckBoardSync()
    On Error GoTo Err_Handler

    Dim basePath As String
    Dim xmlPath As String
    Dim xml As Object
    Dim nodes As Object
    Dim node As Object
    Dim msg As String

    Dim cntTotal As Long
    Dim cntNoNotID As Long
    Dim cntNoStatus As Long
    Dim cntBadDate As Long
    Dim cntNoPdfRef As Long
    Dim cntPdfMissing As Long

    Dim notIdText As String
    Dim statusText As String
    Dim zuletztText As String
    Dim speicherortText As String
    Dim pdfCandidate As String

    basePath = Trim$(Nz(DLookup("LocNotenTisch", "Einstellungen"), ""))
    If Len(basePath) = 0 Then
        MsgBox "? LocNotenTisch ist in Einstellungen leer.", vbExclamation
        Exit Sub
    End If

    If Right$(basePath, 1) <> "\" Then basePath = basePath & "\"
    xmlPath = basePath & "NotenTisch.xml"

    If Dir$(xmlPath, vbNormal) = "" Then
        MsgBox "? XML-Datei nicht gefunden:" & vbCrLf & xmlPath, vbCritical
        Exit Sub
    End If

    Set xml = CreateObject("MSXML2.DOMDocument.6.0")
    xml.async = False
    xml.validateOnParse = False
    xml.resolveExternals = False
    xml.SetProperty "ProhibitDTD", True

    If Not xml.Load(xmlPath) Then
        MsgBox "? XML-Parsing-Fehler:" & vbCrLf & _
               xmlPath & vbCrLf & _
               "Zeile " & xml.parseError.Line & ", Pos " & xml.parseError.linepos & vbCrLf & _
               xml.parseError.reason, vbCritical
        Exit Sub
    End If

    Set nodes = xml.SelectNodes("/*[local-name()='dataroot']/*[local-name()='NotenTisch']")
    cntTotal = nodes.Length

    For Each node In nodes
        notIdText = GetNodeText(node, "NotID")
        statusText = GetNodeText(node, "Arbeitsstatus")
        zuletztText = GetNodeTextEither(node, "zuletztgespielt", "ZuletztGespielt")
        speicherortText = GetNodeText(node, "Speicherort")

        If Len(Trim$(notIdText)) = 0 Or Not IsNumeric(notIdText) Then cntNoNotID = cntNoNotID + 1
        If Len(Trim$(statusText)) = 0 Then cntNoStatus = cntNoStatus + 1

        If Len(Trim$(zuletztText)) > 0 Then
            If Not IsDate(zuletztText) Then cntBadDate = cntBadDate + 1
        End If

        pdfCandidate = ExtractPdfCandidate(speicherortText)
        If Len(pdfCandidate) = 0 Then
            cntNoPdfRef = cntNoPdfRef + 1
        Else
            If Dir$(basePath & "Bl�tter\" & pdfCandidate, vbNormal) = "" Then
                cntPdfMissing = cntPdfMissing + 1
            End If
        End If
    Next node

    msg = "Health Check abgeschlossen:" & vbCrLf & vbCrLf & _
          "XML: " & xmlPath & vbCrLf & _
          "Datens�tze gesamt: " & cntTotal & vbCrLf & vbCrLf & _
          "Fehlende/ung�ltige NotID: " & cntNoNotID & vbCrLf & _
          "Fehlender Arbeitsstatus: " & cntNoStatus & vbCrLf & _
          "Ung�ltiges zuletztgespielt: " & cntBadDate & vbCrLf & _
          "Kein PDF-Verweis in Speicherort: " & cntNoPdfRef & vbCrLf & _
          "PDF-Datei in Bl�tter nicht gefunden: " & cntPdfMissing

    If (cntNoNotID + cntNoStatus + cntBadDate + cntNoPdfRef + cntPdfMissing) = 0 Then
        MsgBox "? Alles OK." & vbCrLf & vbCrLf & msg, vbInformation
    Else
        MsgBox "? Es gibt Auff�lligkeiten." & vbCrLf & vbCrLf & msg, vbExclamation
    End If

    Exit Sub

Err_Handler:
    MsgBox "Fehler im HealthCheckBoardSync: " & Err.Description, vbCritical
End Sub

Private Function GetNodeText(ByVal parent As Object, ByVal nodeName As String) As String
    On Error Resume Next
    Dim n As Object
    Set n = parent.SelectSingleNode(nodeName)
    If n Is Nothing Then
        GetNodeText = ""
    Else
        GetNodeText = Nz(n.Text, "")
    End If
End Function

Private Function GetNodeTextEither(ByVal parent As Object, ByVal nodeName1 As String, ByVal nodeName2 As String) As String
    Dim t As String
    t = GetNodeText(parent, nodeName1)
    If Len(Trim$(t)) = 0 Then t = GetNodeText(parent, nodeName2)
    GetNodeTextEither = t
End Function

Private Function ExtractPdfCandidate(ByVal Speicherort As String) As String
    Dim parts() As String
    Dim I As Long
    Dim p As String

    Speicherort = Trim$(Nz(Speicherort, ""))
    If Len(Speicherort) = 0 Then Exit Function

    parts = Split(Speicherort, "#")
    For I = LBound(parts) To UBound(parts)
        p = Trim$(parts(I))
        If InStr(1, LCase$(p), ".pdf", vbTextCompare) > 0 Then
            ExtractPdfCandidate = Mid$(p, InStrRev(p, "\") + 1)
            If InStr(ExtractPdfCandidate, "/") > 0 Then
                ExtractPdfCandidate = Mid$(ExtractPdfCandidate, InStrRev(ExtractPdfCandidate, "/") + 1)
            End If
            Exit Function
        End If
    Next I
End Function

