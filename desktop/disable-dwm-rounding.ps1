# T144：Windows 11 禁用 DWM 强制圆角
# 通过 dwmapi.dll 设置窗口圆角偏好为 DWMWCP_DONOTROUND，
# 并调用 SetWindowPos(...SWP_FRAMECHANGED) 强制 DWM 重算窗口几何。
param([string]$HwndHex)

# 返回结构化的诊断信息
$result = @{ success = $false; hwnd = $HwndHex; osBuild = 0; error = $null }

try {
    $osBuild = [System.Environment]::OSVersion.Version.Build
    $result.osBuild = $osBuild

    # DWMWA_WINDOW_CORNER_PREFERENCE 仅在 Windows 11 Build 22000+ 支持
    if ($osBuild -lt 22000) {
        $result.error = "OS_BUILD_TOO_OLD"
        Write-Host ($result | ConvertTo-Json -Compress)
        exit 1
    }

    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class DwmHelper {
  [DllImport("dwmapi.dll", PreserveSig = true)]
  public static extern int DwmSetWindowAttribute(IntPtr hwnd, uint attr, ref uint val, uint size);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool IsWindow(IntPtr hWnd);

  public const uint DWMWA_WINDOW_CORNER_PREFERENCE = 33;
  public const uint DWMWCP_DONOTROUND = 1;
  public const uint SWP_FRAMECHANGED = 0x0020;
  public const uint SWP_NOMOVE = 0x0002;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOZORDER = 0x0004;
  public const uint SWP_NOACTIVATE = 0x0010;

  public static string DisableRoundedCorners(IntPtr hwnd) {
    if (!IsWindow(hwnd)) return "INVALID_HWND";
    uint val = DWMWCP_DONOTROUND;
    int hr = DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref val, (uint)Marshal.SizeOf(typeof(uint)));
    if (hr != 0) return "DWM_FAILED_0x" + hr.ToString("X");
    uint flags = SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE;
    if (!SetWindowPos(hwnd, IntPtr.Zero, 0, 0, 0, 0, flags)) {
      int err = Marshal.GetLastWin32Error();
      return "SWP_FAILED_0x" + err.ToString("X");
    }
    return "OK";
  }
}
"@

    $hwndNum = [Convert]::ToInt64($HwndHex, 16)
    $hwndPtr = [IntPtr]::new($hwndNum)
    $status = [DwmHelper]::DisableRoundedCorners($hwndPtr)

    if ($status -eq "OK") {
        $result.success = $true
        Write-Host ($result | ConvertTo-Json -Compress)
        exit 0
    } else {
        $result.error = $status
        Write-Host ($result | ConvertTo-Json -Compress)
        exit 1
    }
} catch {
    $result.error = "EXCEPTION: " + $_.Exception.Message
    Write-Host ($result | ConvertTo-Json -Compress)
    exit 1
}
