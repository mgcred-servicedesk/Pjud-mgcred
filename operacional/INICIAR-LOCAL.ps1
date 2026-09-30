$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 24 LTS antes de continuar.' }
$mgVersion = & node -p 'process.versions.node.split(".")[0]'
if ($mgVersion -ne '24') { throw 'Use Node.js 24 LTS para executar este pacote.' }
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
Write-Host 'Demonstração local da versão operacional: http://127.0.0.1:4320'
if (-not (Test-Path -LiteralPath 'data/portal.sqlite')) {
  $mgAdminEmail = Read-Host 'E-mail do administrador jurídico'
  & node --env-file-if-exists=.env scripts/admin.mjs --email $mgAdminEmail --name 'Administrador Jurídico'
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o administrador.' }
}
Write-Host 'Mantenha esta janela aberta. Acesse o link de ativação acima ou entre com sua conta.'
& node --env-file-if-exists=.env server.mjs
