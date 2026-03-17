<#
.SYNOPSIS
    Erzeugt eine Notentisch-XML aus einem PDF-Verzeichnis.
    Kann auch eine bestehende XML um fehlende PDFs ergänzen (--Merge).

.PARAMETER PdfDir
    Verzeichnis mit den PDF-Dateien (Blätter).

.PARAMETER OutputXml
    Pfad der zu erzeugenden XML-Datei.

.PARAMETER Merge
    Wenn angegeben: bestehende XML wird geladen und nur fehlende PDFs werden hinzugefügt.
    Vorhandene Einträge bleiben unverändert.

.PARAMETER Arbeitsstatus
    Standard-Arbeitsstatus für neue Einträge. Default: "zurückgestellt"

.EXAMPLE
    .\create_xml_from_pdfs.ps1 -PdfDir "C:\...\Noten\Blätter" -OutputXml "Notentisch-Neu.xml"
    .\create_xml_from_pdfs.ps1 -PdfDir "C:\...\Noten\Blätter" -OutputXml "Notentisch.xml" -Merge
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$PdfDir,

    [Parameter(Mandatory=$true)]
    [string]$OutputXml,

    [switch]$Merge,

    [string]$Arbeitsstatus = 'zurückgestellt'
)

$ErrorActionPreference = 'Stop'

# --- Hilfsfunktion: XML-Sonderzeichen escapen ---
function Escape-Xml([string]$s) {
    $s = $s.Replace('&',  '&amp;')
    $s = $s.Replace('<',  '&lt;')
    $s = $s.Replace('>',  '&gt;')
    $s = $s.Replace('"',  '&quot;')
    $s = $s.Replace("'",  '&apos;')
    return $s
}

# --- PDFs einlesen ---
if (-not (Test-Path $PdfDir)) {
    Write-Error "PDF-Verzeichnis nicht gefunden: $PdfDir"
    exit 1
}

$pdfs = Get-ChildItem -Path $PdfDir -Filter '*.pdf' | Sort-Object Name
Write-Host "$($pdfs.Count) PDF(s) gefunden in: $PdfDir"

# --- Merge: bestehende XML laden und bekannte Pfade ermitteln ---
$existingXmlContent = $null
$knownPaths = @{}
$maxNotID = 0

if ($Merge -and (Test-Path $OutputXml)) {
    Write-Host "Merge-Modus: lade bestehende XML: $OutputXml"
    [xml]$existingDoc = Get-Content -Path $OutputXml -Encoding UTF8

    foreach ($node in $existingDoc.dataroot.ChildNodes) {
        $sp = $node.Speicherort
        if ($sp) {
            # Normalisiere Pfadvergleich: nur Dateiname ohne Pfad
            $parts = $sp -split '#'
            foreach ($p in $parts) {
                $clean = $p.Trim()
                if ($clean -ne '' -and $clean.ToLower().EndsWith('.pdf')) {
                    $fname = [System.IO.Path]::GetFileName($clean).ToLower().Trim()
                    $knownPaths[$fname] = $true
                }
            }
        }
        $idText = $node.NotID
        $idNum  = 0
        if ([int]::TryParse($idText, [ref]$idNum)) {
            if ($idNum -gt $maxNotID) { $maxNotID = $idNum }
        }
    }
    $existingXmlContent = Get-Content -Path $OutputXml -Encoding UTF8 -Raw
    Write-Host "$($knownPaths.Count) bereits vorhandene Einträge."
}

# --- Neue Einträge bauen ---
$newEntries = [System.Collections.Generic.List[string]]::new()
$nextId = $maxNotID + 1
$addedCount = 0

foreach ($pdf in $pdfs) {
    $fname = $pdf.Name.ToLower().Trim()

    if ($Merge -and $knownPaths.ContainsKey($fname)) {
        continue  # bereits vorhanden
    }

    $titleRaw  = [System.IO.Path]::GetFileNameWithoutExtension($pdf.Name)
    $title     = Escape-Xml $titleRaw
    $fullPath  = $pdf.FullName
    $speicher  = Escape-Xml "$titleRaw#$fullPath#"
    $status    = Escape-Xml $Arbeitsstatus
    $timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')

    $entry = @"
	<NotenTisch>
		<NotID>$nextId</NotID>
		<Arbeitsstatus>$status</Arbeitsstatus>
		<Titel>$title</Titel>
		<zuletztgespielt/>
		<Speicherort>$speicher</Speicherort>
	</NotenTisch>
"@
    $newEntries.Add($entry)
    $nextId++
    $addedCount++
}

Write-Host "$addedCount neue Einträge werden hinzugefügt."

if ($addedCount -eq 0) {
    Write-Host "Keine neuen Einträge – XML bleibt unverändert."
    exit 0
}

# --- XML zusammenbauen ---
$timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')

if ($Merge -and $existingXmlContent) {
    # Neue Einträge vor </dataroot> einfügen
    $insertion = $newEntries -join "`n"
    $newXml = $existingXmlContent -replace '</dataroot>', "$insertion`n</dataroot>"
} else {
    # Frische XML erzeugen
    $body = $newEntries -join "`n"
    $newXml = @"
<?xml version="1.0" encoding="UTF-8"?><dataroot xmlns:od="urn:schemas-microsoft-com:officedata" generated="$timestamp">
$body</dataroot>
"@
}

# --- Schreiben ---
$outDir = [System.IO.Path]::GetDirectoryName($OutputXml)
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

[System.IO.File]::WriteAllText($OutputXml, $newXml, [System.Text.Encoding]::UTF8)
Write-Host "XML gespeichert: $OutputXml ($addedCount neue Einträge)"
