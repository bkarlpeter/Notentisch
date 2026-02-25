# extract_cards.ps1 - Extrahiert erste Seite aus PDFs mit Poppler
# Speichert PNG-Bilder in Cards_Export/

param(
    [string]$PdfFolder = "Blaetter",
    [string]$OutputFolder = "Cards_Export"
)

function Resolve-PdfFolder {
    param([string]$RequestedFolder)

    if (Test-Path $RequestedFolder) {
        return $RequestedFolder
    }

    $candidate = Get-ChildItem -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'Bl*tter' } |
        Select-Object -First 1

    if ($candidate) {
        return $candidate.FullName
    }

    return $RequestedFolder
}

function Resolve-PdfImagesPath {
    $projectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
    $localCandidate = Join-Path $projectRoot "poppler-25.12.0\Library\bin\pdfimages.exe"

    if (Test-Path $localCandidate) {
        return $localCandidate
    }

    $inPath = Get-Command pdfimages.exe -ErrorAction SilentlyContinue
    if ($inPath) {
        return $inPath.Source
    }

    return $null
}

function Sanitize-Title {
    param([string]$Title)

    $cleaned = $Title.Trim() -replace '\.+$', '' -replace ',+$', '' -replace '\s+$', ''

    $result = 'card_' + $cleaned `
        -replace ([char]0x00F6), 'oe' `
        -replace ([char]0x00E4), 'ae' `
        -replace ([char]0x00FC), 'ue' `
        -replace ([char]0x00D6), 'OE' `
        -replace ([char]0x00C4), 'AE' `
        -replace ([char]0x00DC), 'UE' `
        -replace '[,\.]', '' `
        -replace ' ', '_' `
        -replace '_+$', ''

    return $result + '.png'
}

$pdfImagesExe = Resolve-PdfImagesPath
if (-not $pdfImagesExe) {
    Write-Host "Poppler/pdfimages nicht gefunden." -ForegroundColor Red
    Write-Host "Erwartet: .\\poppler-25.12.0\\Library\\bin\\pdfimages.exe" -ForegroundColor Yellow
    Write-Host "Alternativ pdfimages.exe im PATH verfuegbar machen." -ForegroundColor Yellow
    exit 1
}

$resolvedPdfFolder = Resolve-PdfFolder -RequestedFolder $PdfFolder

if (-not (Test-Path $resolvedPdfFolder)) {
    Write-Host "PDF-Ordner nicht gefunden: $PdfFolder" -ForegroundColor Red
    Write-Host "Hinweis: Erwartet Ordner wie 'Blaetter' oder 'Blätter'." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $OutputFolder)) {
    Write-Host "Erstelle $OutputFolder..."
    New-Item -ItemType Directory -Force -Path $OutputFolder | Out-Null
}

Write-Host "Verwende PDF-Ordner: $resolvedPdfFolder" -ForegroundColor Cyan
Write-Host "Verwende pdfimages: $pdfImagesExe" -ForegroundColor Cyan

$pdfs = Get-ChildItem -Path $resolvedPdfFolder -Filter "*.pdf" -ErrorAction SilentlyContinue
$count = 0

if ($pdfs.Count -eq 0) {
    Write-Host "Keine PDFs in $resolvedPdfFolder gefunden" -ForegroundColor Yellow
    exit 0
}

foreach ($pdf in $pdfs) {
    $pdfName = $pdf.BaseName
    $outputFile = Join-Path $OutputFolder (Sanitize-Title $pdfName)

    if (Test-Path $outputFile) {
        Write-Host " $($pdfName) -> $(Split-Path $outputFile -Leaf) (existiert)" -ForegroundColor Green
        $count++
        continue
    }

    try {
        $tempBase = Join-Path $OutputFolder ("temp_" + [guid]::NewGuid().ToString().Substring(0, 8))
        & $pdfImagesExe -png -f 1 -l 1 $pdf.FullName $tempBase 2>$null

        $generatedFile = Get-ChildItem -Path $OutputFolder -Filter "$(Split-Path $tempBase -Leaf)-*.png" | Select-Object -First 1

        if ($generatedFile) {
            Rename-Item -Path $generatedFile.FullName -NewName (Split-Path $outputFile -Leaf) -Force
            Write-Host " $($pdfName) -> $(Split-Path $outputFile -Leaf)" -ForegroundColor Green
            $count++
        } else {
            Write-Host " $($pdfName) -> Extraction failed" -ForegroundColor Red
        }
    } catch {
        Write-Host " $($pdfName) -> Error: $_" -ForegroundColor Red
    }
}

Write-Host "`nErledigt: $count / $($pdfs.Count) PNGs erstellt" -ForegroundColor Cyan