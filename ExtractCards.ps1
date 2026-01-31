# --- PFADE ---
# Den Pfad exakt so lassen, wie er im Explorer steht
$xmlInput  = "C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\NotenTisch.xml"
$xmlOutput = "C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\notenblaetter_cards.xml"
$exe = ".\poppler-25.12.0\Library\bin\pdftocairo.exe" 
$outputFolder = "Cards_Export"

Set-Location $PSScriptRoot

# 1. Vorab-Check
if (!(Test-Path -LiteralPath $xmlInput)) { 
    Write-Host "FEHLER: Quell-XML nicht gefunden unter: $xmlInput" -ForegroundColor Red
    Pause; exit 
}

# 2. Alte Version löschen & Ordner prüfen
if (Test-Path -LiteralPath $xmlOutput) { Remove-Item -LiteralPath $xmlOutput -Force }
if (!(Test-Path $outputFolder)) { New-Item -ItemType Directory -Path $outputFolder | Out-Null }

# --- XML LADEN (mit explizitem UTF-8 Encoding) ---
$xmlContent = Get-Content -LiteralPath $xmlInput -Encoding UTF8
[xml]$xmlDoc = $xmlContent

Write-Host "Verarbeite NotenTisch.xml..." -ForegroundColor Cyan
Write-Host "Generiere Kartenvorschauen (nur erste Seite)..." -ForegroundColor Yellow

# 4. Synchronisation mit Pfad-Korrektur
foreach ($item in $xmlDoc.dataroot.NotenTisch) {
    # Speicherort säubern (Text#..\Pfad# -> ..\Pfad oder C:\Pfad)
    $rawPath = [string]$item.Speicherort
    $parts = $rawPath -split '#' | Where-Object { $_ -and $_.Trim().Length -gt 0 }
    $pdfPart = $parts | Where-Object { $_ -match '\.pdf' } | Select-Object -First 1
    if (-not $pdfPart) { $pdfPart = $rawPath }

    $pdfPart = [System.Uri]::UnescapeDataString($pdfPart)
    
    # Relativen Pfad (..\..\) in absoluten Pfad umwandeln, absolute Pfade beibehalten
    $xmlFolder = Split-Path -Parent $xmlInput
    if ([System.IO.Path]::IsPathRooted($pdfPart)) {
        $pdfFullPath = $pdfPart
    } else {
        $pdfFullPath = [System.IO.Path]::GetFullPath((Join-Path $xmlFolder $pdfPart))
    }

    # Fallback: wenn PDF nicht gefunden und Pfad enthält "myMusic", versuche OneDrive-Root
    if (!(Test-Path -LiteralPath $pdfFullPath) -and $pdfPart -match "myMusic") {
        $oneDriveRoot = $env:OneDrive
        if ($oneDriveRoot) {
            $index = $pdfPart.IndexOf("myMusic")
            if ($index -ge 0) {
                $tail = $pdfPart.Substring($index)
                $pdfFullPath = Join-Path $oneDriveRoot $tail
            }
        }
    }

    # Letzter Fallback: Datei anhand des Dateinamens im OneDrive\myMusic suchen (case-insensitive)
    if (!(Test-Path -LiteralPath $pdfFullPath)) {
        $oneDriveRoot = $env:OneDrive
        if ($oneDriveRoot) {
            $leaf = [System.IO.Path]::GetFileName($pdfPart)
            if ($leaf) {
                $searchPaths = @(
                    (Join-Path $oneDriveRoot "myMusic\Noten\Blätter"),
                    (Join-Path $oneDriveRoot "myMusic\Noten\Unterhaltung und Stimmung"),
                    (Join-Path $oneDriveRoot "myMusic")
                )
                foreach ($searchPath in $searchPaths) {
                    if (Test-Path -LiteralPath $searchPath) {
                        $found = Get-ChildItem -LiteralPath $searchPath -File -ErrorAction SilentlyContinue | 
                                 Where-Object { $_.Name -eq $leaf } | Select-Object -First 1
                        if (-not $found) {
                            $found = Get-ChildItem -LiteralPath $searchPath -File -ErrorAction SilentlyContinue | 
                                     Where-Object { $_.Name.ToLower() -eq $leaf.ToLower() } | Select-Object -First 1
                        }
                        if ($found) {
                            $pdfFullPath = $found.FullName
                            break
                        }
                    }
                }
            }
        }
    }

    $uniqueId = $item.NotID
    $targetImg = Join-Path $PSScriptRoot "$outputFolder\card_$uniqueId"

    # Überspringe, wenn bereits generiert
    if (Test-Path "$targetImg.png") {
        continue
    }

    # Nur erste Seite rendern (für Kartenvorschau)
    if (Test-Path -LiteralPath $pdfFullPath) {
        Write-Host "." -NoNewline
        & $exe -png -f 1 -l 1 -r 150 -singlefile "$pdfFullPath" "$targetImg" 2>$null
    } else {
        Write-Host "!" -NoNewline
    }
}

Write-Host "`n`nAktualisiere XML mit Bildpfaden..." -ForegroundColor Cyan

# Aktualisiere XML
foreach ($item in $xmlDoc.dataroot.NotenTisch) {
}
Write-Host "`n`nAktualisiere XML mit Bildpfaden..." -ForegroundColor Cyan

# Aktualisiere XML (sequentiell, da XML-Manipulation nicht thread-safe)
foreach ($item in $xmlDoc.dataroot.NotenTisch) {
    $uniqueId = $item.NotID
    $imgPath = "Cards_Export/card_$($uniqueId).png"
    if ($null -eq $item.img) {
        $imgNode = $xmlDoc.CreateElement("img")
        $imgNode.InnerText = $imgPath
        $item.AppendChild($imgNode) | Out-Null
    } else {
        $item.img = $imgPath
    }
}


# --- XML SPEICHERN (mit UTF-8 Deklaration) ---
Write-Host "`n`nSpeichere XML..." -ForegroundColor Cyan
$settings = New-Object System.Xml.XmlWriterSettings
$settings.Indent = $true
$settings.Encoding = [System.Text.Encoding]::UTF8

$writer = [System.Xml.XmlWriter]::Create($xmlOutput, $settings)
$xmlDoc.Save($writer)
$writer.Close()
Write-Host "`nErfolgreich! Board-Datei erstellt: $xmlOutput" -ForegroundColor Green
Pause
