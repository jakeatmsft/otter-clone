param(
  [ValidateSet('dev', 'prod')]
  [string]$Mode = 'dev',
  [int]$Port = 3000,
  [string]$ListenHost = '127.0.0.1',
  [int]$StartupTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'

function Test-TcpPort {
  param(
    [string]$TargetHost,
    [int]$TargetPort
  )

  $client = New-Object System.Net.Sockets.TcpClient

  try {
    $async = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(1000, $false)) {
      return $false
    }

    $client.EndConnect($async) | Out-Null
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Get-NpmPath {
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCommand) {
    return $npmCommand.Source
  }

  $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmCommand) {
    return $npmCommand.Source
  }

  throw 'npm was not found in PATH. Install Node.js on Windows, then reopen PowerShell.'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$envPath = Join-Path $repoRoot '.env.local'
$envExamplePath = Join-Path $repoRoot '.env.local.example'
$nodeModulesPath = Join-Path $repoRoot 'node_modules'
$browserUrl = "http://localhost:$Port"
$npmPath = Get-NpmPath

Set-Location $repoRoot

if (-not (Test-Path $envPath) -and (Test-Path $envExamplePath)) {
  Copy-Item $envExamplePath $envPath
  Write-Host 'Created .env.local from .env.local.example. Update the Azure settings before using transcription features.' -ForegroundColor Yellow
}

if (-not (Test-Path $nodeModulesPath)) {
  Write-Host 'Installing npm dependencies...' -ForegroundColor Cyan
  & $npmPath install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE."
  }
}

if (Test-TcpPort -TargetHost $ListenHost -TargetPort $Port) {
  Start-Process $browserUrl
  Write-Host "seaotter is already running at $browserUrl" -ForegroundColor Green
  exit 0
}

$npmScript = if ($Mode -eq 'prod') {
  "run build && npm.cmd start -- --hostname=$ListenHost --port=$Port"
} else {
  "run dev -- --hostname=$ListenHost --port=$Port"
}

$serverCommand = "title seaotter local server && cd /d `"$repoRoot`" && npm.cmd $npmScript"

Start-Process -FilePath 'cmd.exe' -WorkingDirectory $repoRoot -ArgumentList '/k', $serverCommand | Out-Null

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 750

  if (Test-TcpPort -TargetHost $ListenHost -TargetPort $Port) {
    Start-Process $browserUrl
    Write-Host "seaotter started at $browserUrl" -ForegroundColor Green
    exit 0
  }
}

Write-Warning "seaotter did not respond on $browserUrl within $StartupTimeoutSeconds seconds. Check the 'seaotter local server' window for errors, or open the URL manually once the server is ready."
exit 0
