
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win2 {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
}
"@

$pids = @(Get-Process brave -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$found = @()
$callback = [Win2+EnumWindowsProc]{
  param($hWnd, $lParam)
  if (-not [Win2]::IsWindowVisible($hWnd)) { return $true }
  [uint32]$pid = 0
  [Win2]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
  if ($pids -contains $pid) {
    $sb = New-Object System.Text.StringBuilder 512
    [Win2]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
    $title = $sb.ToString()
    if ($title.Length -gt 0) {
      [Win2]::ShowWindow($hWnd, 9) | Out-Null
      [Win2]::MoveWindow($hWnd, 40, 40, 1400, 900, $true) | Out-Null
      [Win2]::SetForegroundWindow($hWnd) | Out-Null
      $script:found += "$hWnd :: $title"
    }
  }
  return $true
}
[Win2]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
$found | ForEach-Object { $_ }
if (-not $found) { "no visible brave windows" }
