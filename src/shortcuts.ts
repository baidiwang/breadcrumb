// Global shortcut to summon capture from anywhere (desktop).
// Degrades to a no-op in the browser.
// Default chord: Cmd/Ctrl+Shift+Space — change to taste.

export async function registerGlobalShortcuts(
  onTrigger: () => void
): Promise<(() => void) | undefined> {
  // @ts-expect-error injected by Tauri at runtime
  if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) {
    // Browser fallback: a local (non-global) hotkey so dev still feels right.
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        onTrigger();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }

  try {
    const { register, unregister } = await import("@tauri-apps/plugin-global-shortcut");
    const chord = "CmdOrCtrl+Shift+Space";
    await register(chord, onTrigger);
    return () => void unregister(chord);
  } catch {
    return undefined;
  }
}
