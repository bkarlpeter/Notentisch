<#
.SYNOPSIS
    Creates a Notentisch XML from a PDF folder.
    Can also merge missing PDFs into an existing XML (--Merge).
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$PdfDir,

    [Parameter(Mandatory=$true)]
    [string]$OutputXml,

    [switch]$Merge,

    [string]$Arbeitsstatus = ('zur' + [char]0x00FC + 'ckgestellt')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Escape-Xml([string]$s) {
    $s = $s.Replace('&', '&amp;')
    $s = $s.Replace('<', '&lt;')
    $s = $s.Replace('>', '&gt;')
    $s = $s.Replace('"', '&quot;')
    $s = $s.Replace("'", '&apos;')
    return $s
}

if (-not (Test-Path -LiteralPath $PdfDir)) {
    throw "PDF directory not found: $PdfDir"
}

$pdfs = Get-ChildItem -LiteralPath $PdfDir -File -Filter '*.pdf' | Sort-Object Name
Write-Host ($pdfs.Count.ToString() + ' PDF(s) found in: ' + $PdfDir)

$existingXmlContent = $null
$knownNames = @{}
$maxNotId = 0

if ($Merge -and (Test-Path -LiteralPath $OutputXml)) {
    [xml]$existingDoc = Get-Content -LiteralPath $OutputXml -Encoding UTF8

    foreach ($node in $existingDoc.dataroot.ChildNodes) {
        $sp = [string]$node.Speicherort
        if ($sp) {
            $parts = $sp -split '#'
            foreach ($p in $parts) {
                $clean = $p.Trim()
                if ($clean -and $clean.ToLower().EndsWith('.pdf')) {
                    $fname = [System.IO.Path]::GetFileName($clean).ToLower().Trim()
                    if ($fname) { $knownNames[$fname] = $true }
                }
            }
        }

        $idNum = 0
        if ([int]::TryParse([string]$node.NotID, [ref]$idNum)) {
            if ($idNum -gt $maxNotId) { $maxNotId = $idNum }
        }
    }

    $existingXmlContent = Get-Content -LiteralPath $OutputXml -Encoding UTF8 -Raw
    Write-Host ($knownNames.Count.ToString() + ' existing entries loaded.')
}

$newEntries = New-Object System.Collections.Generic.List[string]
$nextId = $maxNotId + 1

foreach ($pdf in $pdfs) {
    $fname = $pdf.Name.ToLower().Trim()
    if ($Merge -and $knownNames.ContainsKey($fname)) { continue }

    $titleRaw = [System.IO.Path]::GetFileNameWithoutExtension($pdf.Name)
    $title = Escape-Xml $titleRaw
    $fullPath = $pdf.FullName
    $speicher = Escape-Xml ("$titleRaw#$fullPath#")
    $status = Escape-Xml $Arbeitsstatus

    $entry = "<NotenTisch><NotID>$nextId</NotID><Arbeitsstatus>$status</Arbeitsstatus><Titel>$title</Titel><zuletztgespielt/><Speicherort>$speicher</Speicherort></NotenTisch>"
    $newEntries.Add($entry)
    $nextId++
}

$addedCount = $newEntries.Count
Write-Host ($addedCount.ToString() + ' new entries to add.')

if ($addedCount -eq 0) {
    Write-Host 'No new entries. XML unchanged.'
    exit 0
}

$timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')

if ($Merge -and $existingXmlContent) {
    $insertion = $newEntries -join "`n"
    $newXml = $existingXmlContent -replace '</dataroot>', ($insertion + "`n</dataroot>")
} else {
    $body = $newEntries -join "`n"
    $newXml = '<?xml version="1.0" encoding="UTF-8"?><dataroot xmlns:od="urn:schemas-microsoft-com:officedata" generated="' + $timestamp + '">' + "`n" + $body + "`n" + '</dataroot>'
}

$outDir = [System.IO.Path]::GetDirectoryName($OutputXml)
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

[System.IO.File]::WriteAllText($OutputXml, $newXml, [System.Text.Encoding]::UTF8)
Write-Host ('XML written: ' + $OutputXml + ' (' + $addedCount + ' new entries)')
