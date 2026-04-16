# Contributing to Notentisch

Danke, dass du mithelfen willst.

## Schnellstart fuer lokale Entwicklung

1. Repository klonen und in den Projektordner wechseln.
2. Lokalen Server starten:

```powershell
py -3 local_server.py 8000
```

3. Im Browser oeffnen:

http://localhost:8000/board.html

## Vor einem Pull Request

1. Aenderung klein und fokussiert halten.
2. Kurz lokal pruefen:
- Laden einer XML
- Drag and Drop in den Center
- Speichern
- Optional Audio-Funktion testen
3. Dokumentation anpassen, wenn sich Verhalten aendert.

## Tests und Checks

Optionaler Python-Paket-Guard:

```powershell
.\test\assert_no_extra_python_packages.ps1
```

Relevante Testdateien liegen im Ordner `test/`.

## Branch- und PR-Regeln

1. Branch-Namen klar benennen, z. B. `fix/audio-reset-gap` oder `docs/install-note`.
2. PR-Titel im Format:
- `fix: ...`
- `feat: ...`
- `docs: ...`
3. PR-Beschreibung soll enthalten:
- Was wurde geaendert?
- Warum war die Aenderung noetig?
- Wie wurde getestet?

## Code-Stil

- Bestehenden Stil im jeweiligen File beibehalten.
- Keine grossen Refactorings in einem Bugfix-PR.
- Kommentare nur dort, wo Logik sonst schwer zu verstehen ist.

## Gute erste Beitraege

Siehe:
- `.github/GOOD_FIRST_ISSUES.md`

## Fragen

Wenn etwas unklar ist, bitte ein Issue mit dem `question`-Template erstellen.
