# Notentisch Board Server
$port = 8080
$url = "http://localhost:$port/"

Write-Host "Notentisch Server - http://localhost:$port/"
Start-Process "${url}board.html"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

$notenBase = "C:\Users\User\OneDrive\myMusic\Noten"
$projectBase = $PSScriptRoot

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath.TrimStart('/')
        if ($path -eq '') { $path = 'board.html' }
        
        try {
            $path = [System.Uri]::UnescapeDataString($path)
        } catch {}
        
        Write-Host "GET $path"
        
        # Pfad bestimmen
        $filePath = ""
        
        if ($path -match '^myMusic') {
            $cleanPath = $path -replace '^myMusic[/\\]Noten[/\\]', '' -replace '/', '\'
            $filePath = Join-Path $notenBase $cleanPath
        } 
        elseif ($path -match '^Noten[/\\]') {
            $cleanPath = $path -replace '^Noten[/\\]', '' -replace '/', '\'
            $filePath = Join-Path $notenBase $cleanPath
        }
        elseif ($path -match '^Blätter') {
            $cleanPath = $path -replace '/', '\'
            $filePath = Join-Path $notenBase $cleanPath
        }
        else {
            $filePath = Join-Path $projectBase $path
        }
        
        Write-Host "  -> $filePath"
        
        # Content-Type
        $contentType = 'application/octet-stream'
        if ($path -match '\.html$') { $contentType = 'text/html' }
        if ($path -match '\.xml$') { $contentType = 'text/xml' }
        if ($path -match '\.pdf$') { $contentType = 'application/pdf' }
        if ($path -match '\.png$') { $contentType = 'image/png' }
        if ($path -match '\.jpg$') { $contentType = 'image/jpeg' }
        if ($path -match '\.js$') { $contentType = 'application/javascript' }
        if ($path -match '\.css$') { $contentType = 'text/css' }
        
        if (Test-Path $filePath) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $content.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($content, 0, $content.Length)
            Write-Host "  OK"
        } else {
            $response.StatusCode = 404
            Write-Host "  404"
        }
        
        $response.Close()
    }
} catch {
    Write-Host "Fehler: $_"
} finally {
    $listener.Stop()
}