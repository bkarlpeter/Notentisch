# ⭐ Ablauf: Zusammenarbeit zwischen Access und dem Notentisch

**Aenderungsstand:** 09.03.2026

Access → Export → NotenTisch.xml → HTML-Board  
HTML-Board → Änderungen → Speichern → NotenTisch.xml → Access

## Inhaltsverzeichnis

- [Schnellablauf](#schnellablauf)
- [Zielbild (aktuell)](#zielbild-aktuell)
- [1. Access – Vorbereitung und Export](#1-access--vorbereitung-und-export)
- [2. HTML-Board – Laden, Anzeigen, Interaktion](#2-html-board--laden-anzeigen-interaktion)
- [3. HTML-Board – Speichern zurück nach XML](#3-html-board--speichern-zurück-nach-xml)
- [4. XML → Access (Import/Sync-Logik, aktuell)](#4-xml--access-importsync-logik-aktuell)
  - [4.1 Import in Tabelle NotenTisch (ImportNotenTischXML)](#41-import-in-tabelle-notentisch-importnotentischxml)
  - [4.2 XML-Vergleich in changesFromBoard (ImportBoardXML)](#42-xml-vergleich-in-changesfromboard-importboardxml)
  - [4.3 Sync nach Notentitel (SyncBoardChanges)](#43-sync-nach-notentitel-syncboardchanges)
  - [4.4 Einheitliche Rückmeldungen](#44-einheitliche-rückmeldungen)
- [5. Betriebs-Hinweise](#5-betriebs-hinweise)

## Schnellablauf

1. In Access Export aus `NotenTisch` nach `NotenTisch.xml` ausführen.
2. Im HTML-Board XML laden, Karten bearbeiten, speichern.
3. In Access XML importieren/synchronisieren.
4. Prüfen: `Arbeitsstatus` und `zuletztgespielt` aktualisiert, Zoomdaten (`CenterAnsicht`) in XML weiterhin vorhanden.

## Zielbild (aktuell)

- Zentrale Austauschdaten sind **Arbeitsstatus** und **zuletztgespielt**.
- Zusätzliche XML-Daten (insbesondere **CenterAnsicht/Zoom**) bleiben erhalten und werden nicht gelöscht.
- Import/Synchronisation arbeiten **nicht-destruktiv** (kein pauschales Löschen aller Datensätze).
- Import-/Sync-Dialoge zeigen ein einheitliches Ergebnisformat: **Neu, Geaendert, Unveraendert, Uebersprungen**.

---

## 1. Access – Vorbereitung und Export

### 1.1 Hauptformular „4-Notentisch“

- Das Formular bildet den digitalen Notentisch mit **vier Unterformularen** ab.
- Jedes Unterformular zeigt Titel eines bestimmten **Arbeitsstatus**:
  - Q1 = neueIdee
  - Q2 = wiederholen
  - Q3 = geuebt
  - Q4 = gelernt
- Der aktuell ausgewählte Quadrant wird über einen Button rechts gesetzt.
- Dieser Wert wird in der Tabelle **Einstellungen** gespeichert und beim nächsten Start wiederhergestellt.

### 1.2 Abfrage „NotenTisch“

- Access erzeugt eine Liste aller Titel, die **einen Arbeitsstatus** besitzen.
- Jeder Datensatz enthält u. a.:
  - Titel
  - Arbeitsstatus
  - Link zum Speicherort des PDF-Scans
  - weitere Metadaten (z. B. NotID, ZuletztGespielt)

### 1.3 Export nach XML

- Mit dem Button **Export** wird die Abfrage als **NotenTisch.xml** exportiert.
- Der Pfad ist in **Einstellungen** hinterlegt (`LocNotenTisch`).
- Technischer Ablauf (aktuell):
  - Export zuerst in eine Temp-Datei
  - Falls vorhandene XML existiert: Übernahme vorhandener `<CenterAnsicht>` je `NotID` in die neue XML (wenn im frischen Export fehlend)
  - Temp-Datei ersetzt danach die Zieldatei

Ergebnis:

- Fachliche Felder aus Access sind aktuell.
- Zoom-/Center-Daten aus dem Board bleiben in der XML erhalten.

### 1.4 Export-Validierung (empfohlen)

- Vor dem Export sollten fehlerhafte `Speicherort`-Werte abgefangen werden.
- Dadurch entstehen im HTML-Board keine leeren Cards durch kaputte Pfade.

Access VBA (in ein Standardmodul):

```vb
Public Function ValidateNotenTischForExport() As Boolean
  On Error GoTo Err_Handler

  Dim rs As DAO.Recordset
  Dim s As String
  Dim badList As String
  Dim cnt As Long

  Set rs = CurrentDb.OpenRecordset( _
    "SELECT NotID, Titel, Speicherort FROM NotenTisch;", dbOpenSnapshot)

  Do While Not rs.EOF
    s = Trim$(Nz(rs!Speicherort, ""))

    If Not IsValidSpeicherort(s) Then
      cnt = cnt + 1
      badList = badList & vbCrLf & _
        "NotID=" & Nz(rs!NotID, "") & " | " & _
        Nz(rs!Titel, "(ohne Titel)") & " | " & s
    End If

    rs.MoveNext
  Loop

  rs.Close
  Set rs = Nothing

  If cnt > 0 Then
    MsgBox "Export abgebrochen: " & cnt & " ungültige Speicherort-Werte gefunden:" & _
         vbCrLf & badList, vbExclamation
    ValidateNotenTischForExport = False
  Else
    ValidateNotenTischForExport = True
  End If

  Exit Function

Err_Handler:
  MsgBox "Fehler bei Export-Validierung: " & Err.Description, vbCritical
  ValidateNotenTischForExport = False
End Function

Private Function IsValidSpeicherort(ByVal s As String) As Boolean
  Dim posHash1 As Long, posHash2 As Long
  Dim titlePart As String, pathPart As String

  s = Trim$(s)
  If Len(s) = 0 Then Exit Function

  posHash1 = InStr(1, s, "#")
  posHash2 = InStrRev(s, "#")

  ' Erlaubte Formate:
  ' 1) Titel#Pfad.pdf#
  ' 2) #Pfad.pdf#
  If posHash1 > 0 And posHash2 > posHash1 Then
    titlePart = Trim$(Left$(s, posHash1 - 1))
    pathPart = Trim$(Mid$(s, posHash1 + 1, posHash2 - posHash1 - 1))

    If Len(pathPart) = 0 Then Exit Function
    If InStr(1, LCase$(pathPart), ".pdf", vbTextCompare) = 0 Then Exit Function

    IsValidSpeicherort = True
    Exit Function
  End If

  ' Fallback: reiner PDF-Pfad ohne #
  If InStr(1, LCase$(s), ".pdf", vbTextCompare) > 0 Then
    IsValidSpeicherort = True
  End If
End Function
```

In `cmdExport` vor `ExportNotenTischXML sFull` ergänzen:

```vb
If Not ValidateNotenTischForExport() Then Exit Sub
```

---

## 2. HTML-Board – Laden, Anzeigen, Interaktion

### 2.1 Laden der XML

- Der Button **Laden** liest die Datei **NotenTisch.xml** ein.
- Die XML wird geparst und für jeden Eintrag ein Card-Container erzeugt.
- Zusätzlich wird ein Verzeichnis der verfügbaren PDF-Scans eingelesen.

### 2.2 Darstellung der Cards

- Jede Card zeigt die **erste Seite des zugehörigen PDFs** als Bild.
- Die Card enthält:
  - Titel
  - Arbeitsstatus
  - ZuletztGespielt
  - Link zum PDF
- Falls kein PDF-Link vorhanden ist:
  - wird eine Card mit Titel **Unbekannt** erzeugt
  - sie erhält trotzdem eine gültige NotID
  - beim Verschieben ins Center bekommt sie ein **ZuletztGespielt-Datum**

### 2.3 Verschieben zwischen Quadranten

- Cards können per Drag-and-Drop zwischen den vier Quadranten verschoben werden.
- Beim Verschieben wird der **Arbeitsstatus** der Card sofort aktualisiert.
- Die UI spiegelt jederzeit den aktuellen Status wider.

### 2.4 Öffnen im Center

- Wird eine Card in die **Center-Zone** gezogen:
  - das zugehörige PDF wird geöffnet
  - der Nutzer kann das Notenblatt ansehen
- Beim Zurücklegen in einen Quadranten (per Klick oder Doppelklick):
  - wird **ZuletztGespielt** auf das aktuelle Datum gesetzt
  - der neue Arbeitsstatus wird gespeichert

---

## 3. HTML-Board – Speichern zurück nach XML

### 3.1 Button „Speichern“

- Der Button aktualisiert die ursprüngliche **NotenTisch.xml**:
  - geänderte **Arbeitsstatus**
  - neue **ZuletztGespielt**-Werte
- Die XML wird überschrieben, aber nur an den geänderten Stellen.
- Zusätzliche Knoten wie **CenterAnsicht** bleiben erhalten.

### 3.2 Ergebnis

- Access kann die aktualisierte XML wieder importieren.
- Die Änderungen erscheinen beim nächsten Öffnen des Formulars.

---

## 4. XML → Access (Import/Sync-Logik, aktuell)

### 4.1 Import in Tabelle `NotenTisch` (`ImportNotenTischXML`)

- Nicht-destruktiver Upsert über `NotID`.
- Kein pauschales `DELETE` mehr.
- Aktualisiert gezielt:
  - `Arbeitsstatus`/`ArbeitsStatus`
  - `zuletztgespielt`/`ZuletztGespielt`
- Datensätze ohne gültige `NotID` werden übersprungen.

### 4.2 XML-Vergleich in `changesFromBoard` (`ImportBoardXML`)

- Vergleich XML gegen lokale Tabelle `Notentitel`.
- In `changesFromBoard` landen nur neue/abgeänderte Datensätze.
- `Null`-Unterschiede bei `zuletztgespielt` werden korrekt berücksichtigt.

### 4.3 Sync nach `Notentitel` (`SyncBoardChanges`)

- Verarbeitung pro `NotID`.
- Es wird nur bei echten Änderungen geschrieben.
- `zuletztgespielt = Null` wird explizit zurückgeschrieben.

### 4.4 Einheitliche Rückmeldungen

Alle drei Routinen melden im gleichen Format:

- `Neu`
- `Geaendert`
- `Unveraendert`
- `Uebersprungen`

Hinweis:

- Bei `SyncBoardChanges` ist `Uebersprungen` derzeit immer `0`, damit das Meldungslayout identisch bleibt.

---

## 5. Betriebs-Hinweise

- `LocNotenTisch` muss auf einen lokal verfügbaren/synchronisierten Pfad zeigen.
- XML wird mit `MSXML2.DOMDocument.6.0` geladen.
- DTD ist deaktiviert (`ProhibitDTD = True`).
- Bei Parsing-Fehlern erfolgt ein Abbruch mit Datei, Zeile und Position.
