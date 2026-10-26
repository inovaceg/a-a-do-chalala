param(
    [string]$AgentToken,
    [ValidateSet("test", "production")][string]$Mode = "test",
    [string]$PrinterName = "Driver - Impressora Bematech MP-2800 TH",
    [ValidateSet("windows", "raw")][string]$PrintMethod = "windows"
)

$ErrorActionPreference = "Stop"
$InstallDir = "C:\ImpressaoAcai"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $InstallDir "config.json"

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "Python 3 não encontrado. Instale Python 3.11+ marcando a opção 'Add Python to PATH' e execute novamente."
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $InstallDir "Testes") -Force | Out-Null
$ExistingConfig = $null
if (Test-Path $ConfigPath) {
    try { $ExistingConfig = Get-Content $ConfigPath -Raw | ConvertFrom-Json } catch { throw "config.json existente não pôde ser lido. Faça uma cópia antes de continuar." }
}
if (-not $AgentToken) { $AgentToken = $ExistingConfig.agent_token }
if (-not $AgentToken) { throw "Informe -AgentToken ou mantenha o token existente em C:\ImpressaoAcai\config.json." }

Copy-Item (Join-Path $SourceDir "agent.py") (Join-Path $InstallDir "agent.py") -Force
Copy-Item (Join-Path $SourceDir "requirements.txt") (Join-Path $InstallDir "requirements.txt") -Force
$VenvPython = Join-Path $InstallDir ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) { py -3 -m venv (Join-Path $InstallDir ".venv") }
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $InstallDir "requirements.txt")

$Config = @{
    agent_token = $AgentToken
    mode = $Mode
    printer_name = $PrinterName
    print_method = $PrintMethod
} | ConvertTo-Json
Set-Content -Path $ConfigPath -Value $Config -Encoding UTF8

Write-Host "Agente atualizado em $InstallDir; token preservado."
Write-Host "Modo: $Mode | Método de impressão: $PrintMethod | Impressora: $PrinterName"
if ($Mode -eq "test") { Write-Host "Os PDFs serão criados em C:\ImpressaoAcai\Testes." }
Write-Host "Iniciar: & 'C:\ImpressaoAcai\.venv\Scripts\python.exe' 'C:\ImpressaoAcai\agent.py'"
