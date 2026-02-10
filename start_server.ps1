# In das HTML-Projektverzeichnis wechseln
Set-Location "C:\Users\User\OneDrive\lapdaten (E)\Daten\Projekt notentisch\Projekt_Notentisch"

# Browser öffnen
Start-Process "http://localhost:8080/board.html"

# Einfachen Webserver starten (Python)
python -m http.server 8080
