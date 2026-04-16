# Überprüfung der Erkennungsfunktion

============================================================

## Wenn Blätter nicht gefunden werden

1. Aufnahmequalität kurz prüfen
- Pro Blatt einmal sauber neu aufnehmen.
- 2-4 Sekunden klarer, lauter, gleichmäßiger Ton.
- Möglichst gleicher Instrumentenklang wie beim späteren Spielen.

2. Direkt danach Diagnose laufen lassen
- Befehl: `./analyze_musicprint_diag.ps1`
- Wichtig sind diese Werte:
	- `scoredCount`
	- `triggeredDrops`
	- `avgBestScore`

3. Fall A: `scoredCount` hoch, aber `triggeredDrops` = 0
- Dann erkennt das System Kandidaten, löst aber nicht aus.
- Das ist ein Tuning-Thema (Schwellen/Trigger), kein Aufnahmeproblem.

4. Fall B: `scoredCount` niedrig
- Dann kommen zu wenig brauchbare Musikframes an.
- Zuerst neu aufnehmen und etwas lauter/konstanter spielen.
- Danach erst Parameter anpassen.

5. Falls Marker fehlt oder veraltet wirkt
- Modus einmal aus/an.
- Blatt neu in den Center ziehen und erneut testen.

============================================================

## Wenn wir zusammen nachjustieren

Bitte dann schicken:

1. Ausgabe von `./analyze_musicprint_diag.ps1`
2. Welche Blätter gespielt wurden
3. Ob der gelbe Marker sichtbar war

Dann können die Werte in einem Schritt gezielt angepasst werden.

============================================================