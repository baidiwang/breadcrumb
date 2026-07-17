// Breadcrumb desktop (Tauri v2).
//
// Native capabilities:
//   foreground_app  — returns the NAME of the frontmost app (never content).
//                     Privacy-graded Level-1 signal. Returns "" when unavailable.
//   setup           — positions the window at the screen's bottom-right corner
//                     (320×420 logical px, 16px margin) then shows it, avoiding
//                     a position-flash from the transparent frameless window.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
fn foreground_app() -> String {
    get_foreground_app().unwrap_or_default()
}

// ---------- macOS ----------
#[cfg(target_os = "macos")]
fn get_foreground_app() -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    let name = app.localizedName()?;
    Some(name.to_string())
}

// ---------- Windows ----------
#[cfg(target_os = "windows")]
fn get_foreground_app() -> Option<String> {
    use windows::Win32::Foundation::{CloseHandle, MAX_PATH};
    use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;
        let mut buf = [0u16; MAX_PATH as usize];
        let len = GetModuleFileNameExW(handle, None, &mut buf);
        let _ = CloseHandle(handle);
        if len == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit(['\\', '/']).next().map(|s| s.to_string())
    }
}

// ---------- other platforms ----------
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_foreground_app() -> Option<String> {
    None
}

// Position the window 16 logical px from the bottom-right of the current monitor.
// Window starts collapsed at 110×110; JS expands it per mode while keeping the
// bottom-right anchor via resizeAnchored() in Toaster.tsx.
fn anchor_bottom_right(win: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = win.current_monitor() else { return };
    let scale = monitor.scale_factor();
    let phys = monitor.size();
    // Convert screen physical size → logical coordinates
    let lw = phys.width  as f64 / scale;
    let lh = phys.height as f64 / scale;
    let margin = 16.0_f64;
    let x = lw - 110.0 - margin;
    let y = lh - 110.0 - margin;
    let _ = win.set_position(tauri::LogicalPosition::new(x, y));
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![foreground_app])
        .setup(|app| {
            let win = app.get_webview_window("main")
                .expect("main webview window not found");
            anchor_bottom_right(&win);
            // Window starts hidden (visible: false in config) to avoid a position flash.
            win.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running breadcrumb");
}
