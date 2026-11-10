// Shortcuts as shown in menus: macOS-style line glyphs for the modifiers and
// the named keys, the rest as text (see bindings.ts for the format: "⌥qi·⇧←").
// Elsewhere than on a Mac, text only ("Alt+qi·Shift+←").

import { keyText, modText, type Shortcut, shortcutLabel, shortcutParts } from "../bindings.ts";
import type { Mod } from "../chords.ts";

// The glyphs' paths are aesthetic's (~/bu/aesthetic/src/icons.ts): line icons
// in the style of macOS menu glyphs, on a 16×16 grid, stroked in currentColor.
const ICONS: Record<string, string> = {
    shift: "M8 2.5 14 8.5h-3.5v5h-5v-5H2Z",
    meta: "M6 6V4a2 2 0 1 0-2 2h8a2 2 0 1 0-2-2v8a2 2 0 1 0 2-2H4a2 2 0 1 0 2 2Z",
    alt: "M2 4.5h3.5l5 7H14M10 4.5h4",
    ctrl: "M4 9.5 8 5l4 4.5",
    enter: "M13 3.5v5H3.5M6.5 5.5l-3 3 3 3",
    backspace: "M6 3.5h8v9H6L2 8ZM8.5 6l3 4m0-4-3 4",
    delete: "M10 3.5H2v9h8l4-4.5ZM4.5 6l3 4m0-4-3 4",
    tab: "M2 8h11M9.5 4.5 13 8l-3.5 3.5M14 3.5v9",
    up: "M8 13V3M4 7l4-4 4 4",
    down: "M8 3v10M4 9l4 4 4-4",
    left: "M13 8H3M7 4 3 8l4 4",
    right: "M3 8h10M9 4l4 4-4 4",
};

const MOD_ICONS: Record<Mod, [icon: string, name: string]> = {
    Ctrl: ["ctrl", "control"],
    Alt: ["alt", "option"],
    Shift: ["shift", "shift"],
    Meta: ["meta", "command"],
};

/** A glyph: an inline SVG, sized by the CSS (keys.css). */
function glyph(name: string, title: string): HTMLElement {
    const span = document.createElement("span");
    span.className = "buche-key-glyph";
    span.title = title;
    span.innerHTML =
        `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" ` +
        `stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;
    return span;
}

/** A shortcut, rendered (its text, for tooltips, in its aria-label). */
export function renderShortcut(s: Shortcut, mac: boolean): HTMLElement {
    const el = document.createElement("span");
    el.className = "buche-keys";
    el.setAttribute("aria-label", shortcutLabel(s, mac));
    for (const p of shortcutParts(s)) {
        if ("sep" in p) {
            el.append(
                Object.assign(document.createElement("span"), {
                    className: "buche-keys-sep",
                    textContent: "·",
                }),
            );
        } else if ("mod" in p) {
            const [icon, name] = MOD_ICONS[p.mod];
            el.append(mac ? glyph(icon, name) : modText(p.mod, mac));
        } else if (mac && ICONS[p.key]) {
            el.append(glyph(p.key, keyText(p.key, false)));
        } else {
            el.append(keyText(p.key, mac));
        }
    }
    return el;
}
