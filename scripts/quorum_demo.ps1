$ErrorActionPreference = "Stop"

$client = "python scripts/tlv_client.py"

function Wait-Node {
  param(
    [string]$NodeHost,
    [int]$Port
  )
  for ($i = 0; $i -lt 40; $i++) {
    try {
      Invoke-Expression "$client --host $NodeHost --port $Port ping" | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "node $NodeHost`:$Port did not become ready in time"
}

Wait-Node -NodeHost "127.0.0.1" -Port 7379
Wait-Node -NodeHost "127.0.0.1" -Port 7380
Wait-Node -NodeHost "127.0.0.1" -Port 7381

$key = "demo:quorum:key"
$value = "vaultkv-replicated-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

Invoke-Expression "$client --host 127.0.0.1 --port 7379 set $key $value" | Out-Host
$leader = (Invoke-Expression "$client --raw --host 127.0.0.1 --port 7379 get $key").Trim()
$f2 = (Invoke-Expression "$client --raw --host 127.0.0.1 --port 7380 get $key").Trim()
$f3 = (Invoke-Expression "$client --raw --host 127.0.0.1 --port 7381 get $key").Trim()

if ($leader -ne $value -or $f2 -ne $value -or $f3 -ne $value) {
  throw "quorum demo failed: leader=$leader follower2=$f2 follower3=$f3 expected=$value"
}

Write-Host "quorum demo success"
Write-Host "key=$key"
Write-Host "value=$value"
