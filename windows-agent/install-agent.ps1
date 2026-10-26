param(
    [Parameter(Mandatory=$true)][string]$AgentToken,
    [ValidateSet("test", "production")][string]$Mode = "test",
    [string]$PrinterName = "Bematech MP-2800 TH"
)

$ErrorActionPreference = "Stop"
$InstallDir = "C:\ImpressaoAcai"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "Python 3 não encontrado. Instale Python 3.11+ marcando a opção 'Add Python to PATH' e execute novamente."
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $InstallDir "Testes") -Force | Out-Null
Copy-Item (Join-Path $SourceDir "agent.py") (Join-Path $InstallDir "agent.py") -Force
Copy-Item (Join-Path $SourceDir "requirements.txt") (Join-Path $InstallDir "requirements.txt") -Force

$VenvPython = Join-Path $InstallDir ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    py -3 -m venv (Join-Path $InstallDir ".venv")
}
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $InstallDir "requirements.txt")

$Config = @{
    agent_token = $AgentToken
    mode = $Mode
    printer_name = $PrinterName
} | ConvertTo-Json
Set-Content -Path (Join-Path $InstallDir "config.json") -Value $Config -Encoding UTF8

Write-Host "Agente instalado em $InstallDir"
Write-Host "Modo: $Mode"
if ($Mode -eq "test") {
    Write-Host "Os PDFs serão criados em C:\ImpressaoAcai\Testes sem abrir janelas."
} else {
    Write-Host "Impressora configurada: $PrinterName"
}
Write-Host "Para iniciar: & 'C:\ImpressaoAcai\.venv\Scripts\python.exe' 'C:\ImpressaoAcai\agent.py'"
