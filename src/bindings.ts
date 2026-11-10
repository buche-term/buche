// Which keys run an action: from the resolved rules (config.ts), the
// shortcuts that would run a given action reference at a location, as the
// keymap would match them (the last rule whose condition holds wins: see
// Keymap). For context menus, and the help pane to come.

import { type ActionRef, refKey } from "./actions.ts";
import { type ChordParts, chordParts, type Mod } from "./chords.ts";
import type { Context, ModeSpec, Rule } from "./config.ts";

/** Where a shortcut is asked about: the keymap's context, but the mode. */
export type Location = Omit<Context, "mode">;
export const ANYWHERE: Location = { inPrompt: false, inPTY: false, inFrame: false };

export interface Shortcut {
    /** The rule's chords (canonical). */
    keys: string[];
    /** The mode it works in (entered first); null: without a mode. */
    mode: ModeSpec | null;
    rule: Rule;
}

/** The shortcuts running `ref` at `loc`: the user's latest rules first. */
export function shortcutsFor(rules: Rule[], ref: ActionRef, loc: Location = ANYWHERE): Shortcut[] {
    const modes = new Map<string, ModeSpec>();
    for (const r of rules) {
        if (r.mode) {
            // (By name: the last one wins, in the order the first was met.)
            modes.set(r.mode.name, r.mode);
        }
    }
    const contexts = [
        { mode: "", spec: null as ModeSpec | null },
        ...[...modes.values()].map((m) => ({ mode: m.name, spec: m })),
    ];
    const holds = (r: Rule, mode: string) => !r.when || r.when.test({ ...loc, mode });
    const wanted = refKey(ref);
    const found: Shortcut[] = [];
    for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (r.mode || refKey(r.ref) !== wanted) {
            continue;
        }
        const keys = r.keys.join(" ");
        const c = contexts.find(
            (c) =>
                holds(r, c.mode) &&
                rules.findLast((q) => q.keys.join(" ") === keys && holds(q, c.mode)) === r,
        );
        if (c) {
            found.push({ keys: r.keys, mode: c.spec, rule: r });
        }
    }
    return found;
}

// ── Display ───────────────────────────────────────────────────────────────────
// A mode's modifier stays held through the whole sequence: "⌥q·w" is Alt
// held, Q, W (not Alt+Q, released, then W). A center dot separates the keys;
// a key's own modifiers stay on it: "⌥q·i·⇧←", "⌥q·i·Enter". Elsewhere than
// on a Mac, modifiers are words: "Alt+q·w", "Alt+q·i·Shift+←", "Ctrl+Tab".

/** A shortcut, part by part (to render it: see shortcutLabel, components/keys.ts). */
export type ShortcutPart = { mod: Mod } | { key: string } | { sep: true };

const MODS_SHOWN: readonly [Mod, keyof ChordParts][] = [
    ["Ctrl", "ctrl"],
    ["Alt", "alt"],
    ["Shift", "shift"],
    ["Meta", "meta"],
];

/** A shortcut's parts: modifiers, keys, and the dots between them. */
export function shortcutParts(s: Shortcut): ShortcutPart[] {
    type Item = { held?: Mod; mods: Mod[]; key: string };
    const items: Item[] = s.mode
        ? [{ held: s.mode.hold, mods: [], key: chordParts(s.mode.code).key }]
        : [];
    for (const chord of s.keys) {
        const p = chordParts(chord);
        items.push({ mods: MODS_SHOWN.filter(([, flag]) => p[flag]).map(([m]) => m), key: p.key });
    }
    const parts: ShortcutPart[] = [];
    items.forEach((it, i) => {
        if (i > 0) {
            parts.push({ sep: true });
        }
        for (const mod of it.held ? [it.held, ...it.mods] : it.mods) {
            parts.push({ mod });
        }
        parts.push({ key: it.key });
    });
    return parts;
}

const MOD_GLYPHS: Record<Mod, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" };
const KEY_TEXT: Record<string, string> = {
    left: "←",
    right: "→",
    up: "↑",
    down: "↓",
    enter: "Enter",
    tab: "Tab",
    esc: "Esc",
    space: "Space",
    home: "Home",
    end: "End",
    pageup: "PgUp",
    pagedown: "PgDn",
};

/** A key (chordParts' name) as text: "q", ",", "←", "Enter", "F5". */
export function keyText(key: string, mac: boolean): string {
    if (key === "backspace") {
        return mac ? "⌫" : "Backspace";
    }
    if (key === "delete") {
        return mac ? "⌦" : "Del";
    }
    return KEY_TEXT[key] ?? (key.length === 1 ? key : key[0].toUpperCase() + key.slice(1));
}

/** A modifier as text: "⌥" on a Mac, "Alt+" elsewhere. */
export const modText = (mod: Mod, mac: boolean): string => (mac ? MOD_GLYPHS[mod] : `${mod}+`);

/** As shown: "⌥q·w", "⌃Tab", "⌥q·i·⇧←" (elsewhere: "Alt+q·w", "Ctrl+Tab"). */
export function shortcutLabel(s: Shortcut, mac: boolean): string {
    return shortcutParts(s)
        .map((p) => ("sep" in p ? "·" : "mod" in p ? modText(p.mod, mac) : keyText(p.key, mac)))
        .join("");
}
