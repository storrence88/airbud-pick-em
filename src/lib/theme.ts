import { useSyncExternalStore } from "react";
import type { Theme } from "./team-colors";

// Light or dark, chosen per device. The choice lives in localStorage and an
// inline script in <head> applies it before first paint, so the page never
// flashes the wrong theme. The server can't know the theme, so markup that
// depends on it uses CSS (`dark:` variants) or, on the client, these hooks.

export type ThemePref = "system" | "light" | "dark";
export const THEME_PREFS: Record<ThemePref, string> = {
	system: "System",
	light: "Light",
	dark: "Dark",
};
export const THEME_KEY = "theme";
/** Browser chrome color per theme; matches --background. */
const BAR = { light: "#f9fafb", dark: "#0b0e14" };

/**
 * Runs in <head> before the body paints. Kept tiny and dependency-free;
 * it also follows the OS setting live while on "system".
 */
export const themeScript = `(function(){var B=${JSON.stringify(BAR)},d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){var p;try{p=localStorage.getItem("${THEME_KEY}")}catch(e){}var t=p==="light"||p==="dark"?p:m.matches?"dark":"light";d.classList.toggle("dark",t==="dark");var c=document.querySelector('meta[name="theme-color"]');if(!c){c=document.createElement("meta");c.name="theme-color";document.head.appendChild(c)}c.content=B[t];d.dispatchEvent(new Event("themechange"))}a();window.__applyTheme=a;m.addEventListener("change",a)})()`;

declare global {
	interface Window {
		__applyTheme?: () => void;
	}
}

function readPref(): ThemePref {
	try {
		const p = localStorage.getItem(THEME_KEY);
		if (p === "light" || p === "dark") return p;
	} catch {}
	return "system";
}

export function setThemePref(pref: ThemePref) {
	try {
		if (pref === "system") localStorage.removeItem(THEME_KEY);
		else localStorage.setItem(THEME_KEY, pref);
	} catch {}
	window.__applyTheme?.();
}

function subscribe(cb: () => void) {
	const el = document.documentElement;
	el.addEventListener("themechange", cb);
	// Another tab changed the setting.
	const onStorage = (e: StorageEvent) => {
		if (e.key === THEME_KEY) window.__applyTheme?.();
	};
	window.addEventListener("storage", onStorage);
	return () => {
		el.removeEventListener("themechange", cb);
		window.removeEventListener("storage", onStorage);
	};
}

/** The theme showing right now. "dark" during server render. */
export function useResolvedTheme(): Theme {
	return useSyncExternalStore(
		subscribe,
		() =>
			document.documentElement.classList.contains("dark") ? "dark" : "light",
		() => "dark",
	);
}

/** The saved choice, including "system". "system" during server render. */
export function useThemePref(): ThemePref {
	return useSyncExternalStore(subscribe, readPref, () => "system");
}
