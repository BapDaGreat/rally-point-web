
import ctypes, time
from ctypes import wintypes
from pathlib import Path
from PIL import ImageGrab

user32 = ctypes.windll.user32

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]
class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG),
                ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]
class INPUT_I(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]
class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("ii", INPUT_I)]

INPUT_KEYBOARD = 1
INPUT_MOUSE = 0
KEYEVENTF_KEYUP = 0x0002
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_ABSOLUTE = 0x8000
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004

def send_key(vk, down=True):
    flags = 0 if down else KEYEVENTF_KEYUP
    ii = INPUT_I()
    ii.ki = KEYBDINPUT(vk, 0, flags, 0, None)
    x = INPUT(INPUT_KEYBOARD, ii)
    user32.SendInput(1, ctypes.byref(x), ctypes.sizeof(x))

def chord(*vks):
    for v in vks:
        send_key(v, True)
    for v in reversed(vks):
        send_key(v, False)

def click_abs(x, y):
    sw = user32.GetSystemMetrics(0)
    sh = user32.GetSystemMetrics(1)
    ax = int(x * 65535 / max(sw, 1))
    ay = int(y * 65535 / max(sh, 1))
    for flags in (
        MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
        MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE,
        MOUSEEVENTF_LEFTUP | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE,
    ):
        ii = INPUT_I()
        ii.mi = MOUSEINPUT(ax, ay, 0, flags, 0, None)
        user32.SendInput(1, ctypes.byref(INPUT(INPUT_MOUSE, ii)), ctypes.sizeof(INPUT))
        time.sleep(0.04)

EnumWindows = user32.EnumWindows
EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
GetWindowTextW = user32.GetWindowTextW
GetWindowTextLengthW = user32.GetWindowTextLengthW
IsWindowVisible = user32.IsWindowVisible
SetForegroundWindow = user32.SetForegroundWindow
ShowWindow = user32.ShowWindow
MoveWindow = user32.MoveWindow

target = None

def cb(hwnd, lParam):
    global target
    if not IsWindowVisible(hwnd):
        return True
    n = GetWindowTextLengthW(hwnd)
    if not n:
        return True
    buf = ctypes.create_unicode_buffer(n + 1)
    GetWindowTextW(hwnd, buf, n + 1)
    if "UI/UX" in buf.value and "Figma" in buf.value:
        target = hwnd
    return True

EnumWindows(EnumWindowsProc(cb), 0)
print("hwnd", target)
if not target:
    raise SystemExit(1)
ShowWindow(target, 9)
MoveWindow(target, 40, 40, 1500, 950, True)
SetForegroundWindow(target)
time.sleep(0.5)

# Click layers: rpg_logo 1 (approx)
click_abs(190, 325)
time.sleep(0.35)
# Figma zoom to selection: Shift+2
chord(0x10, 0x32)
time.sleep(1.0)

img = ImageGrab.grab(bbox=(40, 40, 1540, 990))
p = Path(r"C:\Users\dange\Rally-Point-web\public\figma-zoomed.png")
img.save(p)
print("saved", p, img.size)

# Also try zooming more with +
for _ in range(6):
    chord(0xBB)  # VK_OEM_PLUS near equals - may need shift
    time.sleep(0.1)
# actually Figma zoom in is Ctrl+= 
for _ in range(8):
    chord(0x11, 0xBB)  # ctrl +
    time.sleep(0.08)
time.sleep(0.4)
img2 = ImageGrab.grab(bbox=(40, 40, 1540, 990))
p2 = Path(r"C:\Users\dange\Rally-Point-web\public\figma-zoomed2.png")
img2.save(p2)
print("saved", p2)
