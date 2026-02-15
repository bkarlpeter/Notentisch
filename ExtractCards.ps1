# --- PFADE ---
$xmlInput  = "C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\Noten\NotenTisch.xml"
$xmlOutput = "C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\notenblaetter_cards.xml"
$exe = ".\poppler-25.12.0\Library\bin\pdftocairo.exe" 
$outputFolder = "Cards_Export"

Set-Location $PSScriptRoot

# 1. Vorab-Check
if (!(Test-Path -LiteralPath $xmlInput)) { 
    Write-Host "FEHLER: $xmlInput nicht gefunden!" -ForegroundColor Red
    Pause; exit 
}

# 2. Alte Version löschen & Ordner prüfen
if (Test-Path -LiteralPath $xmlOutput) { Remove-Item -LiteralPath $xmlOutput -Force }
if (!(Test-Path $outputFolder)) { New-Item -ItemType Directory -Path $outputFolder | Out-Null }

# --- XML LADEN ---
$xmlContent = Get-Content -LiteralPath $xmlInput -Encoding UTF8
[xml]$xmlDoc = $xmlContent

Write-Host "Verarbeite $(($xmlDoc.dataroot.NotenTisch | Measure-Object).Count) NotenTisch-Einträge..." -ForegroundColor Cyan
Write-Host "Generiere Kartenvorschauen..." -ForegroundColor Yellow

# GENERIERE ALLE CARDS
foreach ($item in $xmlDoc.dataroot.NotenTisch) {
    $rawPath = [string]$item.Speicherort
    $parts = $rawPath -split '#' | Where-Object { $_ -and $_.Trim().Length -gt 0 }
    $pdfPart = $parts | Where-Object { $_ -match '\.pdf' } | Select-Object -First 1
    if (-not $pdfPart) { $pdfPart = $rawPath }

    $pdfPart = [System.Uri]::UnescapeDataString($pdfPart)
    
    # Pfad auflösen
    $xmlFolder = Split-Path -Parent $xmlInput
    if ([System.IO.Path]::IsPathRooted($pdfPart)) {
        $pdfFullPath = $pdfPart
    } else {
        $pdfFullPath = [System.IO.Path]::GetFullPath((Join-Path $xmlFolder $pdfPart))
    }

    # Fallback: myMusic
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

    # Sanitize Titel für Dateiname
    $uniqueId = $item.Titel.Trim()
    $uniqueId = $uniqueId -replace 'ä','ae' -replace 'ö','oe' -replace 'ü','ue' -replace 'Ä','AE' -replace 'Ö','OE' -replace 'Ü','UE' -replace 'ß','ss'
    $uniqueId = $uniqueId -replace '[^\w\s-]','' -replace '\s+',' '
    $uniqueId = $uniqueId.Trim() -replace '\s+','_'
    $targetImg = Join-Path $PSScriptRoot "$outputFolder\card_$uniqueId"

    # PDF konvertieren
    if (Test-Path -LiteralPath $pdfFullPath) {
        Write-Host "." -NoNewline
        & $exe -png -f 1 -l 1 -r 150 -singlefile "$pdfFullPath" "$targetImg" 2>$null
    } else {
        Write-Host "X" -NoNewline
    }
}

Write-Host "`n`nSpeichere XML..." -ForegroundColor Cyan

$settings = New-Object System.Xml.XmlWriterSettings
$settings.Indent = $true
$settings.Encoding = [System.Text.Encoding]::UTF8

$writer = [System.Xml.XmlWriter]::Create($xmlOutput, $settings)
$xmlDoc.Save($writer)
$writer.Close()

Write-Host "`nErfolgreich! $xmlOutput erstellt" -ForegroundColor Green
Pause

