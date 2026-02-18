# extract_cards.ps1 - Extrahiert erste Seite aus PDFs mit Poppler
# Speichert PNG-Bilder in Cards_Export/

param(
    [string]$PdfFolder = "Blätter",
    [string]$OutputFolder = "Cards_Export"
)

# Prüfe, ob Ordner existieren
if (-not (Test-Path $PdfFolder)) {
    Write-Host "PDF-Ordner nicht gefunden: $PdfFolder" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $OutputFolder)) {
    Write-Host "Erstelle $OutputFolder..."
    New-Item -ItemType Directory -Force -Path $OutputFolder | Out-Null
}

# Hilfsfunktion: Sanitize Titel wie in filehandling.js
function Sanitize-Title {
    param([string]$titel)
    
    $cleaned = $titel.Trim() -replace '\.+$', '' -replace ',+$', '' -replace '\s+$', ''
    
    $result = 'card_' + $cleaned `
        -replace 'ö', 'oe' `
        -replace 'ä', 'ae' `
        -replace 'ü', 'ue' `
        -replace 'Ö', 'OE' `
        -replace 'Ä', 'AE' `
        -replace 'Ü', 'UE' `
        -replace '[,\.]', '' `
        -replace ' ', '_' `
        -replace '_+$', ''
    
    return $result + '.png'
}

# Verarbeite alle PDFs
$pdfs = Get-ChildItem -Path $PdfFolder -Filter "*.pdf" -ErrorAction SilentlyContinue
$count = 0

if ($pdfs.Count -eq 0) {
    Write-Host "Keine PDFs in $PdfFolder gefunden" -ForegroundColor Yellow
    exit 0
}

foreach ($pdf in $pdfs) {
    $pdfName = $pdf.BaseName
    $outputFile = Join-Path $OutputFolder (Sanitize-Title $pdfName)
    
    # Überspringe, wenn bereits vorhanden
    if (Test-Path $outputFile) {
        Write-Host " $($pdfName)  $(Split-Path $outputFile -Leaf) (existiert)" -ForegroundColor Green
        $count++
        continue
    }
    
    # Extrahiere erste Seite mit pdfimages
    try {
        $tempBase = Join-Path $OutputFolder "temp_$([guid]::NewGuid().ToString().Substring(0,8))"
        & pdfimages -png -f 1 -l 1 $($pdf.FullName) $tempBase 2>$null
        
        # Rename pdfimages Output (erzeugt: temp-000.png)
        $generatedFile = Get-ChildItem -Path $OutputFolder -Filter "$(Split-Path $tempBase -Leaf)-*.png" | Select-Object -First 1
        
        if ($generatedFile) {
            Rename-Item -Path $generatedFile.FullName -NewName (Split-Path $outputFile -Leaf) -Force
            Write-Host " $($pdfName)  $(Split-Path $outputFile -Leaf)" -ForegroundColor Green
            $count++
        } else {
            Write-Host " $($pdfName) - Extraction failed" -ForegroundColor Red
        }
    } catch {
        Write-Host " $($pdfName) - Error: $_" -ForegroundColor Red
    }
}

Write-Host "`nErledigt: $count / $($pdfs.Count) PNGs erstellt" -ForegroundColor Cyan
