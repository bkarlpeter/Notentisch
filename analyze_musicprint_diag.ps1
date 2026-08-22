param(
    [string]$InputPath = "mysounds/musicprint_diagnostics.jsonl",
    [switch]$AsJson,
    [string]$ReportPath = "mysounds/musicprint_diag_report.txt",
    [switch]$PauseAtEnd
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$reportLines = New-Object System.Collections.Generic.List[string]

function Add-ReportLine {
    param([string]$Line = "")
    $reportLines.Add($Line) | Out-Null
    Write-Host $Line
}

function Save-ReportFile {
    if (-not $ReportPath) { return }
    $reportDir = Split-Path -Parent $ReportPath
    if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
        New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
    }
    Set-Content -LiteralPath $ReportPath -Value ($reportLines -join [Environment]::NewLine) -Encoding UTF8
    Write-Host "Report gespeichert: $ReportPath"
}

function Complete-Report {
    Save-ReportFile
    if ($PauseAtEnd) {
        [void](Read-Host "ENTER druecken zum Beenden")
    }
    exit 0
}

function Get-SafeAverage {
    param([double[]]$Values)
    if (-not $Values -or $Values.Count -eq 0) { return $null }
    return [Math]::Round((($Values | Measure-Object -Average).Average), 4)
}

if (-not (Test-Path -LiteralPath $InputPath)) {
    Add-ReportLine "Keine Diagnose-Datei gefunden: $InputPath"
    Add-ReportLine "Erzeuge erst Laufdaten in Tonsuche, dann erneut ausfuehren."
    Complete-Report
}

$events = New-Object System.Collections.Generic.List[object]
Get-Content -LiteralPath $InputPath -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    try {
        $obj = $line | ConvertFrom-Json
        if ($obj -ne $null) {
            $events.Add($obj)
        }
    } catch {
        # Ungueltige Zeilen still ignorieren
    }
}

if ($events.Count -eq 0) {
    Add-ReportLine "Keine gueltigen JSON-Events in: $InputPath"
    Complete-Report
}

$byEvent = @($events | Group-Object event | Sort-Object Count -Descending)
$matchingScored = @($events | Where-Object { $_.event -eq "matching_scored" })
$matchingDrop = @($events | Where-Object { $_.event -eq "matching_triggered_drop" })
$matchingPending = @($events | Where-Object { $_.event -eq "matching_pending_votes" })
$fingerprintSaved = @($events | Where-Object { $_.event -eq "fingerprint_saved" })
$recordingTooShort = @($events | Where-Object { $_.event -eq "recording_too_short" })

$bestScores = @($matchingScored | ForEach-Object { [double]($_.bestScore) })
$gaps = @($matchingScored | ForEach-Object {
    if ($null -ne $_.scoreGap -and $_.scoreGap -ne "") { [double]($_.scoreGap) }
})

$threshold = if ($matchingScored.Count -gt 0) { [double]($matchingScored[0].threshold) } else { $null }
$gapLimit = 0.0
$belowThresholdCount = if ($matchingScored.Count -gt 0 -and $null -ne $threshold) {
    @($matchingScored | Where-Object { [double]($_.bestScore) -lt $threshold }).Count
} else { 0 }
$belowGapCount = if ($matchingScored.Count -gt 0) {
    @($matchingScored | Where-Object {
        $g = $_.scoreGap
        $null -ne $g -and $g -ne "" -and [double]$g -lt $gapLimit
    }).Count
} else { 0 }

$dropByCard = @($matchingDrop |
    Group-Object matchedCardId |
    Sort-Object Count -Descending |
    ForEach-Object {
        [pscustomobject]@{
            matchedCardId = $_.Name
            drops = $_.Count
        }
    })

$summary = [pscustomobject]@{
    sourceFile = (Resolve-Path -LiteralPath $InputPath).Path
    totalEvents = $events.Count
    firstTs = ($events[0].ts)
    lastTs = ($events[-1].ts)
    eventTypeCount = @($byEvent | ForEach-Object {
        [pscustomobject]@{ event = $_.Name; count = $_.Count }
    })
    matching = [pscustomobject]@{
        scoredCount = $matchingScored.Count
        triggeredDrops = $matchingDrop.Count
        pendingHits = $matchingPending.Count
        avgBestScore = (Get-SafeAverage -Values $bestScores)
        avgGapToSecond = (Get-SafeAverage -Values $gaps)
        threshold = $threshold
        gapLimit = $gapLimit
        belowThresholdCount = $belowThresholdCount
        belowGapCount = $belowGapCount
        dropByCard = @($dropByCard)
    }
    recording = [pscustomobject]@{
        fingerprintSaved = $fingerprintSaved.Count
        tooShort = $recordingTooShort.Count
    }
}

if ($AsJson) {
    $json = $summary | ConvertTo-Json -Depth 8
    Add-ReportLine $json
    Finish-AndExit
}

Add-ReportLine "=== MusicPrint Diagnose Zusammenfassung ==="
Add-ReportLine "Datei: $($summary.sourceFile)"
Add-ReportLine "Zeitraum: $($summary.firstTs)  ->  $($summary.lastTs)"
Add-ReportLine "Events gesamt: $($summary.totalEvents)"
Add-ReportLine ""

Add-ReportLine "Eventtypen:"
$eventTypeTable = ($summary.eventTypeCount | Format-Table -AutoSize | Out-String).TrimEnd()
if ($eventTypeTable) {
    foreach ($line in ($eventTypeTable -split "`r?`n")) {
        Add-ReportLine $line
    }
} else {
    Add-ReportLine "(keine)"
}
Add-ReportLine ""

Add-ReportLine "Matching:"
Add-ReportLine "- scoredCount: $($summary.matching.scoredCount)"
Add-ReportLine "- triggeredDrops: $($summary.matching.triggeredDrops)"
Add-ReportLine "- pendingHits: $($summary.matching.pendingHits)"
Add-ReportLine "- avgBestScore: $($summary.matching.avgBestScore)"
Add-ReportLine "- avgGapToSecond: $($summary.matching.avgGapToSecond)"
Add-ReportLine "- threshold: $($summary.matching.threshold)"
Add-ReportLine "- gapLimit: $($summary.matching.gapLimit)"
Add-ReportLine "- belowThresholdCount: $($summary.matching.belowThresholdCount)"
Add-ReportLine "- belowGapCount: $($summary.matching.belowGapCount)"
Add-ReportLine ""

Add-ReportLine "Triggered Drops nach Karte:"
if ($summary.matching.dropByCard.Count -gt 0) {
    $dropTable = ($summary.matching.dropByCard | Format-Table -AutoSize | Out-String).TrimEnd()
    foreach ($line in ($dropTable -split "`r?`n")) {
        Add-ReportLine $line
    }
} else {
    Add-ReportLine "(keine)"
}

Add-ReportLine ""
Add-ReportLine "Recording:"
Add-ReportLine "- fingerprintSaved: $($summary.recording.fingerprintSaved)"
Add-ReportLine "- tooShort: $($summary.recording.tooShort)"

Complete-Report
