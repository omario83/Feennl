$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $folder
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite

$action = {
    $changed = $Event.SourceEventArgs.Name
    if ($changed -like "*.html" -or $changed -like "*.css" -or $changed -like "*.js") {
        Start-Sleep -Seconds 2
        Set-Location $folder
        git add .
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
        git commit -m "Automatische update: $timestamp"
        git push
        Write-Host "Gepusht naar GitHub: $changed ($timestamp)" -ForegroundColor Green
    }
}

Register-ObjectEvent $watcher "Changed" -Action $action | Out-Null
Write-Host "Auto-push actief. Sla een bestand op om automatisch te pushen naar GitHub..." -ForegroundColor Cyan
Write-Host "Stop met Ctrl+C" -ForegroundColor Yellow

while ($true) { Start-Sleep -Seconds 1 }
