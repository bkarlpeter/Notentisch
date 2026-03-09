param(
    [string]$BaseUrl = 'http://127.0.0.1:8000'
)

$ErrorActionPreference = 'Stop'

Write-Host '=== Notentisch E2E Smoke Check (Config ↔ Board) ===' -ForegroundColor Cyan

function Assert-StatusCode {
    param(
        [string]$Url,
        [int]$Expected = 200
    )

    $status = (Invoke-WebRequest -UseBasicParsing $Url).StatusCode
    if ($status -ne $Expected) {
        throw "HTTP check failed for $Url (got $status, expected $Expected)"
    }
    Write-Host "OK  $status  $Url" -ForegroundColor Green
}

function Assert-Contains {
    param(
        [string]$File,
        [string]$Needle
    )

    if (-not (Test-Path $File)) {
        throw "File not found: $File"
    }

    $content = Get-Content -Path $File -Raw -Encoding UTF8
    if ($content -notmatch [regex]::Escape($Needle)) {
        throw "Missing expected text in ${File}: $Needle"
    }
    Write-Host "OK  contains '$Needle' in $File" -ForegroundColor Green
}

Assert-StatusCode "$BaseUrl/board.html"
Assert-StatusCode "$BaseUrl/config.html"
Assert-StatusCode "$BaseUrl/advanced_config.html"

Assert-Contains 'functions.js' 'BOARD_SESSION_STATE_KEY'
Assert-Contains 'functions.js' 'restoreBoardSessionState'
Assert-Contains 'functions.js' 'openConfigPage'
Assert-Contains 'center-view.js' 'getCurrentCenterRuntimeState'
Assert-Contains 'center-view.js' 'restoreCenterRuntimeState'
Assert-Contains 'center-view.js' 'showPdfPages(pdfPath, options = {})'
Assert-Contains 'config.html' 'advanced_config.html'
Assert-Contains 'config.html' 'backToBoardBtn'

Write-Host ''
Write-Host 'Manueller Kurztest:' -ForegroundColor Yellow
Write-Host '1) board.html öffnen und ein Blatt ins CENTER ziehen.'
Write-Host '2) Zoom/Ausrichtung ändern (z.B. Mitte + Zoom +).' 
Write-Host '3) Config über C öffnen, dann "Zurück zum Board".'
Write-Host '4) Prüfen: gleiches Blatt, gleicher Zoom, gleiche Ausrichtung, gleicher Center-Modus.'
Write-Host ''
Write-Host 'Smoke-Check abgeschlossen.' -ForegroundColor Cyan
