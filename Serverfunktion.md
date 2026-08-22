# Notentisch: lokaler Server

Notentisch verwendet `local_server.py` als lokalen HTTP-Server. Er liefert die
HTML-, JavaScript- und CSS-Dateien aus und ermöglicht den Zugriff auf
`Cards_Export/`, `Blätter/` und `mysounds/`.

## Start

Im Projektordner:

```powershell
py -3 local_server.py 8000
```

Danach öffnen:

```text
http://127.0.0.1:8000/board.html
```

Im Release-Paket übernimmt `Notentisch.exe` diese Aufgabe. Der Start erfolgt
über `Notentisch.bat` oder unsichtbar über `Notentisch.vbs`.

## Verzeichnisstruktur

```text
Notentisch/
├── board.html
├── config.html
├── advanced_config.html
├── local_server.py
├── Notentisch.bat
├── Notentisch.vbs
├── Cards_Export/              # optionale PNG-Kartenbilder
├── Blätter/                   # lokaler PDF-Ordner oder Junction
├── mysounds/                  # lokale Audioaufnahmen und Diagnose-Logs
└── poppler-25.12.0/           # Poppler für die Kartenvorschau
```

`Blätter/` enthält die persönlichen PDF-Noten und wird nicht mit dem
öffentlichen Release ausgeliefert. Für eine Junction als Administrator:

```powershell
cmd /c mklink /J "Blätter" "D:\Pfad\zu\deinen\PDFs"
```

## Serververhalten

- Bindung ausschließlich an `127.0.0.1`; kein externer Netzwerkzugriff.
- Standard-Port: `8000`; ein anderer Port kann als erstes Argument angegeben werden.
- Normale Dateien werden mit `no-cache` ausgeliefert.
- Steuer- und API-Endpunkte verwenden `no-store`.
- Der Server läuft als `ThreadingHTTPServer`.

## Audio-Endpunkte

Der Browser verwendet diese lokalen POST-Endpunkte:

| Endpunkt | Zweck |
|---|---|
| `/__audio_upload__?filename=...` | Audioaufnahme nach `mysounds/` speichern |
| `/__audio_delete__?path=mysounds/...` | Audioaufnahme löschen |
| `/__audio_diag__` | Diagnose-Events in `mysounds/musicprint_diagnostics.jsonl` speichern |
| `/__session__` | Session-Token für das Beenden abfragen |
| `/__shutdown__` | Server mit gültigem Token beenden |

Audio-Uploads sind auf `.webm`, `.ogg`, `.wav`, `.m4a` und `.mp3` beschränkt
und dürfen höchstens 25 MB groß sein. Der Diagnose-Request ist auf 512 KB
begrenzt.

`GET /__shutdown__` ist absichtlich deaktiviert. Das Beenden benötigt einen
`POST` mit dem Header `X-Notentisch-Token` und dem Body `shutdown`.

## Kartenvorschauen

`extract_cards.ps1` nutzt bevorzugt:

```text
poppler-25.12.0\Library\bin\pdfimages.exe
```

Falls `pdfimages.exe` keine Vorschau erzeugt, wird nach Möglichkeit
`pdftoppm.exe` als Fallback verwendet. Die PNG-Dateien werden in
`Cards_Export/` abgelegt.

## Fehlerprüfung

404 bei Board, PDF oder PNG weist meistens auf einen falschen Serverordner,
eine fehlende `Blätter`-Junction oder fehlende Kartenvorschauen hin.

Bei Audio-Problemen zuerst prüfen, ob der Server läuft und `mysounds/`
beschreibbar ist. Diagnose-Events können anschließend mit folgendem Skript
ausgewertet werden:

```powershell
.\analyze_musicprint_diag.ps1
```
