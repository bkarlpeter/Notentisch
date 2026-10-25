# extract_title_lines.ps1 - Erstellt PNG-Ausschnitte der ersten 8 cm jeder PDF-Seite
# Speichert die Ausschnitte in titleLines/

param(
    [string]$PdfFolder = "Blaetter",
    [string]$OutputFolder = "titleLines",
    [double]$HeightCm = 8,
    [int]$Resolution = 300
)

function Resolve-PdfFolder {
    param([string]$RequestedFolder)

    if (Test-Path -LiteralPath $RequestedFolder) {
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

function Resolve-PdfToPpmPath {
    $projectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
    $localCandidate = Join-Path $projectRoot "poppler-25.12.0\Library\bin\pdftoppm.exe"

    if (Test-Path -LiteralPath $localCandidate) {
        return $localCandidate
    }

    $inPath = Get-Command pdftoppm.exe -ErrorAction SilentlyContinue
    if ($inPath) {
        return $inPath.Source
    }

    return $null
}

function Sanitize-Title {
    param([string]$Title)

    $cleaned = $Title.Trim() -replace '\.+$', '' -replace ',+$', '' -replace '\s+$', ''

    $result = 'titleLine_' + $cleaned `
        -replace ([char]0x00F6), 'oe' `
        -replace ([char]0x00E4), 'ae' `
        -replace ([char]0x00FC), 'ue' `
        -replace ([char]0x00D6), 'OE' `
        -replace ([char]0x00C4), 'AE' `
        -replace ([char]0x00DC), 'UE' `
        -replace '[,\.]', '' `
        -replace ' ', '_' `
        -replace '[<>:"/\\|?*]', '_' `
        -replace '_+$', ''

    return $result + '.png'
}

if ($HeightCm -le 0) {
    Write-Host "Die Ausschnitthoehe muss groesser als 0 cm sein." -ForegroundColor Red
    exit 1
}
if ($Resolution -le 0) {
    Write-Host "Die Aufloesung muss groesser als 0 DPI sein." -ForegroundColor Red
    exit 1
}

$pdfToPpmExe = Resolve-PdfToPpmPath
if (-not $pdfToPpmExe) {
    Write-Host "Poppler/pdftoppm nicht gefunden." -ForegroundColor Red
    Write-Host "Erwartet: .\poppler-25.12.0\Library\bin\pdftoppm.exe" -ForegroundColor Yellow
    Write-Host "Alternativ pdftoppm.exe im PATH verfuegbar machen." -ForegroundColor Yellow
    exit 1
}

$resolvedPdfFolder = Resolve-PdfFolder -RequestedFolder $PdfFolder
if (-not (Test-Path -LiteralPath $resolvedPdfFolder -PathType Container)) {
    Write-Host "PDF-Ordner nicht gefunden: $PdfFolder" -ForegroundColor Red
    Write-Host "Hinweis: Erwartet Ordner wie 'Blaetter' oder 'Blätter'." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path -LiteralPath $OutputFolder)) {
    New-Item -ItemType Directory -Force -Path $OutputFolder | Out-Null
}

$pdfs = @(Get-ChildItem -LiteralPath $resolvedPdfFolder -Filter "*.pdf" -File -ErrorAction SilentlyContinue)
if ($pdfs.Count -eq 0) {
    Write-Host "Keine PDFs in $resolvedPdfFolder gefunden" -ForegroundColor Yellow
    exit 0
}

$cropHeightPixels = [int][Math]::Round(($HeightCm / 2.54) * $Resolution)
$count = 0
$failedCount = 0

Write-Host "Verwende PDF-Ordner: $resolvedPdfFolder" -ForegroundColor Cyan
Write-Host "Verwende pdftoppm: $pdfToPpmExe" -ForegroundColor Cyan
Write-Host "Ausschnitt: $HeightCm cm ab Seitenoberkante bei $Resolution DPI ($cropHeightPixels Pixel)" -ForegroundColor Cyan

foreach ($pdf in $pdfs) {
    $outputFile = Join-Path $OutputFolder (Sanitize-Title $pdf.BaseName)
    $tempBase = Join-Path $OutputFolder ("temp_" + [guid]::NewGuid().ToString("N"))
    $tempFile = "$tempBase.png"

    try {
        & $pdfToPpmExe -png -f 1 -l 1 -singlefile -r $Resolution -x 0 -y 0 -H $cropHeightPixels $pdf.FullName $tempBase
        if ($LASTEXITCODE -ne 0) {
            throw "pdftoppm wurde mit Exitcode $LASTEXITCODE beendet."
        }
        if (-not (Test-Path -LiteralPath $tempFile)) {
            throw "pdftoppm hat keine PNG-Datei erzeugt."
        }

        Move-Item -LiteralPath $tempFile -Destination $outputFile -Force
        Write-Host " $($pdf.BaseName) -> $(Split-Path $outputFile -Leaf)" -ForegroundColor Green
        $count++
    } catch {
        Write-Host " $($pdf.BaseName) -> Fehler: $_" -ForegroundColor Red
        $failedCount++
    } finally {
        if (Test-Path -LiteralPath $tempFile) {
            Remove-Item -LiteralPath $tempFile -Force
        }
    }
}

Write-Host "`nErledigt: $count / $($pdfs.Count) TitleLines erstellt" -ForegroundColor Cyan
if ($failedCount -gt 0) {
    Write-Host "$failedCount PDF(s) konnten nicht verarbeitet werden." -ForegroundColor Red
    exit 1
}
