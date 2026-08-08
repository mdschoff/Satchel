<#
.SYNOPSIS
  Boot an installed Satchel.exe and assert its MCP backend comes up healthy.

.DESCRIPTION
  Satchel's MCP server is a headless assertion surface. If it answers a real
  initialize + tools/list handshake, then tauri's setup() ran to completion -
  meaning the library dirs were created, sqlite opened and rebuilt its index,
  and mcp::spawn bound its port. That verifies the whole backend without
  needing anyone at a Windows desktop looking at a window.

  Shared by the MSI and NSIS legs of the Windows smoke test.

.PARAMETER Exe
  Path to the installed Satchel.exe.

.PARAMETER LogDir
  Directory to write captured stdout/stderr into.
#>
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][string]$LogDir
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Exe)) { throw "no such executable: $Exe" }
Write-Host "probing $Exe (FileVersion=$((Get-Item $Exe).VersionInfo.FileVersion))"

$out = Join-Path $LogDir "satchel.out.log"
$err = Join-Path $LogDir "satchel.err.log"

# RUST_LOG so a failure inside setup() leaves a trace we can actually read.
$env:RUST_LOG = "satchel=debug"
$app = Start-Process $Exe -PassThru -RedirectStandardOutput $out -RedirectStandardError $err

try {
  # Poll the port. Checking HasExited each iteration means a panic in setup()
  # reports in seconds instead of burning the full timeout.
  $up = $false
  foreach ($i in 1..60) {
    if ($app.HasExited) { throw "app exited during startup with code $($app.ExitCode)" }
    $c = Test-NetConnection -ComputerName 127.0.0.1 -Port 7825 `
           -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($c) { $up = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $up) { throw "MCP server never bound 127.0.0.1:7825 (60s)" }
  Write-Host "MCP server is listening"

  $url = "http://127.0.0.1:7825/mcp"
  $headers = @{ "Accept" = "application/json, text/event-stream" }

  # -- initialize ------------------------------------------------------------
  $init = @{
    jsonrpc = "2.0"; id = 1; method = "initialize"
    params  = @{
      protocolVersion = "2025-03-26"
      capabilities    = @{}
      clientInfo      = @{ name = "ci-smoke"; version = "1.0" }
    }
  } | ConvertTo-Json -Depth 10

  $r = Invoke-WebRequest -Uri $url -Method Post -Body $init `
         -ContentType "application/json" -Headers $headers -TimeoutSec 30
  $sid = $r.Headers["mcp-session-id"]
  if ($sid -is [array]) { $sid = $sid[0] }
  if (-not $sid) { throw "initialize returned no mcp-session-id header" }
  Write-Host "initialized, session=$sid"

  $sessed = $headers.Clone()
  $sessed["mcp-session-id"] = $sid

  # -- notifications/initialized ---------------------------------------------
  $note = @{ jsonrpc = "2.0"; method = "notifications/initialized" } | ConvertTo-Json -Depth 5
  Invoke-WebRequest -Uri $url -Method Post -Body $note `
    -ContentType "application/json" -Headers $sessed -TimeoutSec 30 | Out-Null

  # -- tools/list -------------------------------------------------------------
  $list = @{ jsonrpc = "2.0"; id = 2; method = "tools/list"; params = @{} } | ConvertTo-Json -Depth 5
  $r2 = Invoke-WebRequest -Uri $url -Method Post -Body $list `
          -ContentType "application/json" -Headers $sessed -TimeoutSec 30

  # rmcp frames POST responses as SSE ("data: {...}"), so match on content
  # rather than parsing a strict JSON envelope.
  $body = $r2.Content
  $expected = @(
    "list_projects", "create_project", "list_artifacts", "search_artifacts",
    "get_artifact_source", "render_artifact", "create_artifact",
    "update_artifact", "list_artifact_versions"
  )
  $missing = $expected | Where-Object { $body -notmatch [regex]::Escape($_) }
  if ($missing) {
    Write-Host "--- tools/list response ---"
    Write-Host $body
    throw "tools/list missing: $($missing -join ', ')"
  }
  Write-Host "all $($expected.Count) MCP tools present - backend is healthy"
}
finally {
  if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force -EA SilentlyContinue }
  foreach ($f in @($out, $err)) {
    if ((Test-Path $f) -and (Get-Item $f).Length -gt 0) {
      Write-Host "--- $f ---"
      Get-Content $f -Tail 80
    }
  }
}
