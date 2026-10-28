use tauri::Manager;

// Reclaim inactive WebView caches without suspending JavaScript or audio.
// Older installed runtimes can lack this optional COM interface.
pub fn configure(app: &tauri::App) {
    let handle = app.handle().clone();
    if let Some(window) = app.get_webview_window("main") {
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                let focused = *focused;
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.with_webview(move |webview| unsafe {
                        use webview2_com::Microsoft::Web::WebView2::Win32::{
                            ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
                            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
                        };
                        use windows_core::Interface;
                        if let Ok(core) = webview.controller().CoreWebView2() {
                            if let Ok(core) = core.cast::<ICoreWebView2_19>() {
                                let _ = core.SetMemoryUsageTargetLevel(if focused {
                                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                                } else {
                                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                                });
                            }
                        }
                    });
                }
            }
        });
    }
}
