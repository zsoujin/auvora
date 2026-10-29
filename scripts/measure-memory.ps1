param([string]$Label = 'playback', [string]$Output = '', [int]$RootProcessId = 0)
$ErrorActionPreference = 'Stop'
$all = @(Get-CimInstance Win32_Process)
$ids = [System.Collections.Generic.HashSet[int]]::new()
foreach ($item in $all) { if ($item.Name -eq 'auvora.exe' -and (!$RootProcessId -or $item.ProcessId -eq $RootProcessId)) { [void]$ids.Add([int]$item.ProcessId) } }
if (!$ids.Count) { throw 'auvora is not running' }
do {
    $added = $false
    foreach ($item in $all) {
        if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $added = $true }
    }
} while ($added)
$counters = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process)
$rows = foreach ($id in $ids) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (!$p) { continue }
    $counter = $counters | Where-Object { $_.IDProcess -eq $id } | Select-Object -First 1
    [pscustomobject]@{
        pid = $id; name = $p.ProcessName
        workingSetBytes = $p.WorkingSet64
        privateBytes = $p.PrivateMemorySize64
        privateWorkingSetBytes = if ($counter) { [long]$counter.WorkingSetPrivate } else { $null }
    }
}
if (!@($rows).Count) { throw 'auvora exited before memory counters could be collected' }
$workingSetBytes = [long]($rows | Measure-Object workingSetBytes -Sum).Sum
$privateWorkingSetRows = @($rows | Where-Object { $null -ne $_.privateWorkingSetBytes })
$privateWorkingSetBytes = if ($privateWorkingSetRows.Count -eq @($rows).Count) {
    [long]($privateWorkingSetRows | Measure-Object privateWorkingSetBytes -Sum).Sum
} else {
    $null
}
$result = [pscustomobject]@{
    timestamp = (Get-Date).ToString('o'); label = $Label
    processCount = @($rows).Count
    targetMetric = 'privateWorkingSet'
    targetBytes = 250000000
    meetsTarget = if ($null -eq $privateWorkingSetBytes) { $null } else { $privateWorkingSetBytes -le 250000000 }
    workingSetBytes = $workingSetBytes
    meetsWorkingSetTarget = ($workingSetBytes -le 250000000)
    workingSetMiB = [math]::Round($workingSetBytes / 1MB, 2)
    privateMiB = [math]::Round(($rows | Measure-Object privateBytes -Sum).Sum / 1MB, 2)
    privateWorkingSetBytes = $privateWorkingSetBytes
    privateWorkingSetMiB = if ($null -eq $privateWorkingSetBytes) { $null } else { [math]::Round($privateWorkingSetBytes / 1MB, 2) }
    processes = @($rows)
}
$json = $result | ConvertTo-Json -Depth 5
if ($Output) { $json | Set-Content -LiteralPath $Output -Encoding utf8 }
$json
