// Breadcrumb desktop (Tauri v2).
//
// The only native capability here is `foreground_app`: it returns the NAME of the
// frontmost application (e.g. "Google Chrome"), never its contents. This is the
// privacy-graded Level-1 signal described in BUOY_SPEC §4. On macOS it requires the
// user to grant Accessibility permission once; until then it returns an empty string
// and the app falls back to Level-0 (it still works).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn foreground_app() -> String {
    get_foreground_app().unwrap_or_default()
}

// ---------- macOS ----------
#[cfg(target_os = "macos")]
fn get_foreground_app() -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    // Safe: AppKit main-thread access; called from the webview thread is acceptable
    // for reading frontmostApplication's localizedName.
    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let app = workspace.frontmostApplication()?;
        let name = app.localizedName()?;
        Some(name.to_string())
    }
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
        if hwnd.0 == std::ptr::null_mut() {
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
        // return just the executable file name as the "app name"
        path.rsplit(['\\', '/']).next().map(|s| s.to_string())
    }
}

// ---------- other platforms ----------
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_foreground_app() -> Option<String> {
    None
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![foreground_app])
        .run(tauri::generate_context!())
        .expect("error while running breadcrumb");
}
