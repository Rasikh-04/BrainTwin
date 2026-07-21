/**
 * Theme handling for the whole app.
 *
 * "clinical light" is the default surface (a bright imaging-workstation look);
 * "clinical dark" is the alternate. The choice is stored on <html data-theme>
 * so the CSS token overrides in globals.css apply, and persisted to
 * localStorage so a reviewer's preference survives a reload.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "braintwin-theme";
export const DEFAULT_THEME: Theme = "light";

/** The tiny script inlined in <head> to set the theme before first paint, so a
 *  dark-preferring reviewer never sees a flash of the light default. Kept as a
 *  string because it must run synchronously before React hydrates. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t='${DEFAULT_THEME}';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;

/**
 * The persisted theme is the source of truth. We reconcile against this on
 * mount rather than reading the DOM attribute, because React hydration can strip
 * the attribute the pre-paint script added (it is not a React-controlled prop).
 */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return DEFAULT_THEME;
  }
}

/** Apply a theme to the document and persist it. */
export function applyTheme(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A private-mode reviewer with storage disabled still gets the theme for
    // this session; only persistence is lost, which is non-fatal.
  }
}
