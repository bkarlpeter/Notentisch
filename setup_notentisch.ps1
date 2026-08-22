$ErrorActionPreference = 'Stop'

function Read-YesNoChoice {
    param(
        [string]$Question
    )

    while ($true) {
        $answer = (Read-Host "$Question (j/n)").Trim().ToLower()
        if ($answer -in @('j', 'ja', 'y', 'yes')) { return $true }
        if ($answer -in @('n', 'nein', 'no')) { return $false }
        Write-Host "Bitte 'j' oder 'n' eingeben." -ForegroundColor Yellow
    }
}

function Resolve-PythonCommand {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        return [PSCustomObject]@{ Exe = 'python'; PrefixArgs = @() }
    }

    if (Get-Command py -ErrorAction SilentlyContinue) {
        return [PSCustomObject]@{ Exe = 'py'; PrefixArgs = @('-3') }
    }

    return $null
}

function Get-PythonVersionString {
    param(
        [string]$Exe,
        [string[]]$PrefixArgs
    )

    try {
        $result = & $Exe @PrefixArgs --version 2>&1
        return ($result | Out-String).Trim()
    } catch {
        return 'Unbekannt'
    }
}

function New-Junction {
    param(
        [string]$LinkPath,
        [string]$TargetPath
    )

    cmd /c mklink /J $LinkPath $TargetPath | Out-Null
    return (Test-Path $LinkPath)
}

function Test-DownloadedInstallerSecurity {
    param(
        [string]$FilePath,
        [string]$ExpectedSha256 = ''
    )

    if (-not (Test-Path $FilePath)) {
        Write-Host "Installer nicht gefunden: $FilePath" -ForegroundColor Red
        return $false
    }

    $sig = Get-AuthenticodeSignature -FilePath $FilePath
    if ($sig.Status -ne 'Valid') {
        Write-Host "Signaturprüfung fehlgeschlagen: $($sig.Status)" -ForegroundColor Red
        return $false
    }

    $subject = [string]$sig.SignerCertificate.Subject
    if ($subject -notmatch 'Python Software Foundation') {
        Write-Host "Unerwarteter Signierer: $subject" -ForegroundColor Red
        return $false
    }

    if ($ExpectedSha256) {
        $actualHash = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $ExpectedSha256.ToLowerInvariant()) {
            Write-Host "SHA256-Prüfung fehlgeschlagen." -ForegroundColor Red
            return $false
        }
    }

    return $true
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Das Setup benoetigt Administratorrechte. Starte Skript als Administrator neu ..." -ForegroundColor Yellow
    $elevatedArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
    Start-Process powershell.exe -Verb RunAs -ArgumentList $elevatedArgs
    exit
}

# Keine zusätzliche Set-ExecutionPolicy-Änderung nötig:
# Das Skript wird bereits explizit mit -ExecutionPolicy Bypass gestartet.

Write-Host "=== Digitaler Notentisch - Ersteinrichtung ===" -ForegroundColor Cyan

Push-Location $PSScriptRoot
$setupCompleted = $true

try {
    $pythonCmd = Resolve-PythonCommand

    if (-not $pythonCmd) {
        Write-Host "Python 3 wurde nicht gefunden!" -ForegroundColor Red

        if (Read-YesNoChoice -Question "Soll Python 3 automatisch installiert werden?") {
            $pythonInstaller = Join-Path $env:TEMP 'python-installer.exe'
            # Optional fixieren: Wenn gewünscht, hier den erwarteten SHA256 hinterlegen.
            # Dann wird neben Signatur auch Hash strikt geprüft.
            $expectedPythonInstallerSha256 = ''
            Write-Host "Lade Python-Installer herunter ..." -ForegroundColor Cyan
            Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.2/python-3.12.2-amd64.exe' -OutFile $pythonInstaller

            if (-not (Test-DownloadedInstallerSecurity -FilePath $pythonInstaller -ExpectedSha256 $expectedPythonInstallerSha256)) {
                Remove-Item $pythonInstaller -Force -ErrorAction SilentlyContinue
                Write-Host "Installer wurde aus Sicherheitsgründen verworfen." -ForegroundColor Red
                Read-Host "Weiter mit Enter"
                exit 1
            }

            Write-Host "Starte Python-Installer ..." -ForegroundColor Yellow
            Start-Process -FilePath $pythonInstaller -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1' -Wait
            Remove-Item $pythonInstaller -Force -ErrorAction SilentlyContinue

            $pythonCmd = Resolve-PythonCommand
            if (-not $pythonCmd) {
                Write-Host "Python-Installation fehlgeschlagen. Bitte manuell installieren: https://www.python.org/downloads/windows/" -ForegroundColor Red
                Read-Host "Weiter mit Enter"
                exit 1
            }
        } else {
            Write-Host "Bitte Python 3 installieren und Setup erneut starten." -ForegroundColor Yellow
            Read-Host "Weiter mit Enter"
            exit 1
        }
    }

    $pyVersion = Get-PythonVersionString -Exe $pythonCmd.Exe -PrefixArgs $pythonCmd.PrefixArgs
    Write-Host "Python gefunden: $pyVersion" -ForegroundColor Green

    $popplerPath = Join-Path $PSScriptRoot 'poppler-25.12.0\Library\bin\pdfimages.exe'
    if (-not (Test-Path $popplerPath)) {
        Write-Host "Poppler (pdfimages.exe) wurde nicht gefunden!" -ForegroundColor Yellow
        Write-Host "Download: https://github.com/oschwartz10612/poppler-windows/releases" -ForegroundColor Yellow
        Write-Host "Erwarteter Pfad: $popplerPath" -ForegroundColor Yellow
        Read-Host "Weiter mit Enter (ohne Poppler werden keine Kartenbilder erzeugt)"
    } else {
        Write-Host "Poppler gefunden: $popplerPath" -ForegroundColor Green
    }

    $blaetterName = 'Bl' + [char]228 + 'tter'
    $blaetterLink = Join-Path $PSScriptRoot $blaetterName
    $defaultCandidates = @(
        (Join-Path 'C:\Users\User\OneDrive\myMusic\Noten' $blaetterName),
        (Join-Path 'C:\Users\karl-\OneDrive\myMusic\Noten' $blaetterName)
    )

    if (-not (Test-Path $blaetterLink)) {
        Write-Host "Der Ordner '$blaetterName' existiert nicht." -ForegroundColor Yellow

        $sourcePath = $defaultCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

        if (-not $sourcePath) {
            $sourcePath = Read-Host "Bitte Pfad zu Ihren PDF-Dateien angeben (z.B. D:\Noten\$blaetterName)"
        }

        if (-not (Test-Path $sourcePath)) {
            $setupCompleted = $false
            Write-Host "Pfad nicht gefunden: $sourcePath" -ForegroundColor Red
            Write-Host "Bitte Ordner prüfen und Setup erneut starten." -ForegroundColor Yellow
        } else {
            Write-Host "Erstelle Junction: $blaetterName -> $sourcePath" -ForegroundColor Cyan
            if (New-Junction -LinkPath $blaetterLink -TargetPath $sourcePath) {
                Write-Host "Junction erfolgreich erstellt." -ForegroundColor Green
            } else {
                Write-Host "Fehler beim Erstellen der Junction!" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "$blaetterName-Ordner gefunden." -ForegroundColor Green
    }

    $cardsExport = Join-Path $PSScriptRoot 'Cards_Export'
    if (-not (Test-Path $cardsExport)) {
        Write-Host "Erstelle Ordner: Cards_Export" -ForegroundColor Cyan
        New-Item -ItemType Directory -Force -Path $cardsExport | Out-Null
    } else {
        Write-Host "Cards_Export-Ordner gefunden." -ForegroundColor Green
    }

    $desktop = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktop 'Notentisch.lnk'
    $targetPath = Join-Path $PSScriptRoot 'Notentisch.vbs'
    $icon = Join-Path $PSScriptRoot "zither2.jpg"

    $iconCandidates = @(
        (Join-Path $PSScriptRoot 'History\Zither2.ico'),
        (Join-Path $PSScriptRoot 'History\Notentisch.ico'),
        (Join-Path $PSScriptRoot 'History\zither2.ico')
    )
    $iconPath = $iconCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (Test-Path $targetPath) {
        $wsh = New-Object -ComObject WScript.Shell
        $shortcut = $wsh.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $targetPath
        $shortcut.WorkingDirectory = $PSScriptRoot
        if ($iconPath) {
            $shortcut.IconLocation = $iconPath
        }
        $shortcut.Save()
        Write-Host "Desktop-Verknuepfung 'Notentisch' wurde erstellt." -ForegroundColor Green
    } else {
        Write-Host "Warnung: Notentisch.vbs nicht gefunden, keine Desktop-Verknüpfung erstellt." -ForegroundColor Yellow
    }

    if ($setupCompleted) {
        New-Item -ItemType File -Force -Path (Join-Path $PSScriptRoot '.setup_notentisch_done') | Out-Null
    }
    Write-Host "Setup abgeschlossen." -ForegroundColor Green
    Write-Host "Start erfolgt ueber Notentisch.vbs / Notentisch.bat." -ForegroundColor Yellow
}
finally {
    Pop-Location
}

