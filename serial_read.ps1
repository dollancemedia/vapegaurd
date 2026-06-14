$port = New-Object System.IO.Ports.SerialPort 'COM4', 115200
$port.ReadTimeout = 2000
$port.DtrEnable = $true
$port.RtsEnable = $true
$port.Open()
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.ElapsedMilliseconds -lt 30000) {
    try { Write-Host $port.ReadLine() } catch { }
}
$port.Close()
