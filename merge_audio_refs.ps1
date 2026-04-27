# merge_audio_refs.ps1
# Überträgt AudioReferenz-Blöcke aus einer Quell-XML in die aktuelle XML,
# abgeglichen per <Titel>. Karten ohne Treffer bleiben unverändert.

param(
    [string]$SourceXml  = "C:\Users\User\OneDrive\myMusic\Notentisch\release\Notentisch-v2026.04.16\Noten\Notentisch.xml",
    [string]$TargetXml  = "C:\Users\User\OneDrive\myMusic\Notentisch\Noten\Notentisch.xml",
    [string]$BackupXml  = "C:\Users\User\OneDrive\myMusic\Notentisch\Noten\Notentisch_backup_before_merge.xml"
)

# Backup anlegen
Copy-Item -Path $TargetXml -Destination $BackupXml -Force
Write-Host "Backup erstellt: $BackupXml"

# XMLs laden
[xml]$src = Get-Content $SourceXml -Encoding UTF8
[xml]$tgt = Get-Content $TargetXml -Encoding UTF8

# AudioReferenz aus Quelle per Titel indexieren (alle Vorkommen)
$srcMap = @{}
foreach ($node in $src.SelectNodes("//*[local-name()='NotenTisch' or local-name()='Notentisch']")) {
    $titelNode = $node.SelectSingleNode("Titel")
    $titel = if ($titelNode) { $titelNode.InnerText.Trim() } else { $null }
    if (!$titel) { continue }
    $audioNodes = $node.SelectNodes("AudioReferenz")
    if ($audioNodes.Count -gt 0) {
        $srcMap[$titel] = $audioNodes
    }
}
Write-Host "Quell-XML: $($srcMap.Count) Karten mit AudioReferenz gefunden."

# In Ziel-XML einfügen/ersetzen
$merged = 0
$skipped = 0
foreach ($node in $tgt.SelectNodes("//*[local-name()='NotenTisch' or local-name()='Notentisch']")) {
    $titelNode2 = $node.SelectSingleNode("Titel")
    $titel = if ($titelNode2) { $titelNode2.InnerText.Trim() } else { $null }
    if (!$titel -or !$srcMap.ContainsKey($titel)) {
        $skipped++
        continue
    }

    # Vorhandene AudioReferenz-Knoten entfernen
    foreach ($old in @($node.SelectNodes("AudioReferenz"))) {
        $node.RemoveChild($old) | Out-Null
    }

    # Neue AudioReferenz-Knoten aus Quelle importieren
    foreach ($srcAudio in $srcMap[$titel]) {
        $imported = $tgt.ImportNode($srcAudio, $true)
        $node.AppendChild($imported) | Out-Null
    }

    Write-Host "  Übertragen: $titel ($($srcMap[$titel].Count) Referenz(en))"
    $merged++
}

# Speichern
$tgt.Save($TargetXml)
Write-Host ""
Write-Host "Fertig: $merged Karten mit AudioReferenz aktualisiert, $skipped ohne Treffer übersprungen."
Write-Host "Datei gespeichert: $TargetXml"
