$port = New-Object System.IO.Ports.SerialPort 'COM4', 115200
$port.ReadTimeout = 2000
$port.DtrEnable = $false
$port.RtsEnable = $false
$port.Open()
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.ElapsedMilliseconds -lt 180000) {
    try {
        $line = $port.ReadLine()
        $ts = [int]($sw.ElapsedMilliseconds / 1000)
        Write-Host "${ts}s | $line"
    } catch { }
}
$port.Close()
Write-Host "--- Done (180s) ---"
