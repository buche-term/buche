// Chords: parsing them as written in the config, their canonical form
// ("Shift+Alt+KeyQ": modifiers in carreau's order, then the key's
// `KeyboardEvent.code`), key events' chords, and how chords are shown.

export type Mod = "Shift" | "Alt" | "Ctrl" | "Meta";
export type Side = "left" | "right" | "either";

/** Modifiers in carreau's canonical chord order. */
export const MOD_ORDER: readonly Mod[] = ["Shift", "Alt", "Ctrl", "Meta"];

export const MOD_NAMES: Record<string, Mod | "Mod"> = {
    ctrl: "Ctrl",
    control: "Ctrl",
    alt: "Alt",
    option: "Alt",
    opt: "Alt",
    shift: "Shift",
    meta: "Meta",
    cmd: "Meta",
    command: "Meta",
    super: "Meta",
    win: "Meta",
    mod: "Mod",
};

/** Punctuation keys ↔ their `KeyboardEvent.code`. */
export const PUNCTUATION: Record<string, string> = {
    "-": "Minus",
    "=": "Equal",
    "[": "BracketLeft",
    "]": "BracketRight",
    "\\": "Backslash",
    ";": "Semicolon",
    "'": "Quote",
    "`": "Backquote",
    ",": "Comma",
    ".": "Period",
    "/": "Slash",
};
export const PUNCTUATION_CODES: Record<string, string> = Object.fromEntries(
    Object.entries(PUNCTUATION).map(([ch, code]) => [code, ch]),
);

/** Named keys (case-insensitive) → their code. */
export const NAMED_KEYS: Record<string, string> = {
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    space: "Space",
    esc: "Escape",
    escape: "Escape",
    backspace: "Backspace",
    delete: "Delete",
    del: "Delete",
    insert: "Insert",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
};

/** A parsed chord: its modifiers and its key (a `KeyboardEvent.code`). */
export interface Chord {
    mods: Set<Mod>;
    code: string;
    /** For a single modifier restricted to one side (AltLeft+q). */
    side: Side;
}

/** The `KeyboardEvent.code` of a key as written in the config. */
export function keyCode(token: string): string | null {
    if (/^[a-z]$/i.test(token)) {
        return `Key${token.toUpperCase()}`;
    }
    if (/^[0-9]$/.test(token)) {
        return `Digit${token}`;
    }
    if (token in PUNCTUATION) {
        return PUNCTUATION[token];
    }
    const named = NAMED_KEYS[token.toLowerCase()];
    if (named) {
        return named;
    }
    if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(token)) {
        return token.toUpperCase();
    }
    // A code, as is (KeyQ, Digit1, Comma, Numpad1, ...).
    if (/^(Key[A-Z]|Digit[0-9]|Numpad\w+)$/.test(token) || token in PUNCTUATION_CODES) {
        return token;
    }
    return null;
}

/** Parse a chord like "Ctrl+Shift+Tab". Throws (a message) if malformed. */
export function parseChord(text: string, mac: boolean): Chord {
    const tokens = text.split("+").map((t) => t.trim());
    const keyToken = tokens.pop() ?? "";
    const mods = new Set<Mod>();
    let side: Side = "either";
    for (const token of tokens) {
        const m = /^(?:(left|right)?([a-z]+?)(left|right)?)$/i.exec(token);
        const name = m && MOD_NAMES[m[2].toLowerCase()];
        if (!m || !name || (m[1] && m[3])) {
            throw new Error(`"${token}" is not a modifier`);
        }
        const mod = name === "Mod" ? (mac ? "Meta" : "Ctrl") : name;
        const s = (m[1] ?? m[3])?.toLowerCase() as Side | undefined;
        if (s) {
            side = s;
        }
        mods.add(mod);
    }
    if (!keyToken) {
        throw new Error("no key");
    }
    if (MOD_NAMES[keyToken.toLowerCase()]) {
        throw new Error(`the key is missing (${keyToken} is a modifier)`);
    }
    const code = keyCode(keyToken);
    if (!code) {
        throw new Error(`"${keyToken}" is not a key`);
    }
    return { mods, code, side };
}

/** A chord in the canonical form: modifiers in order, then the key's code. */
export function chordString(mods: Iterable<Mod>, code: string): string {
    const set = new Set(mods);
    return [...MOD_ORDER.filter((m) => set.has(m)), code].join("+");
}

/**
 * A chord as written (e.g. "Mod+p", "alt+,", "Alt+KeyQ") in the canonical
 * form ("Meta+KeyP", "Alt+Comma", "Alt+KeyQ"); null if it isn't one.
 */
export function canonicalChord(text: string, mac: boolean): string | null {
    try {
        const chord = parseChord(text, mac);
        return chordString(chord.mods, chord.code);
    } catch {
        return null;
    }
}

export const MOD_FLAGS: [Mod, "shiftKey" | "altKey" | "ctrlKey" | "metaKey"][] = [
    ["Shift", "shiftKey"],
    ["Alt", "altKey"],
    ["Ctrl", "ctrlKey"],
    ["Meta", "metaKey"],
];

/**
 * The chords a key event can stand for, in the canonical form: by its
 * physical key (`code`) first, then by the key it types (other keyboard
 * layouts). `strip`: a modifier left out (a mode's).
 */
export function eventChords(
    e: Pick<KeyboardEvent, "code" | "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey">,
    strip?: Mod,
): string[] {
    const mods = MOD_FLAGS.filter(([m, flag]) => e[flag] && m !== strip).map(([m]) => m);
    const chords = e.code ? [chordString(mods, e.code)] : [];
    const typed =
        e.key === " "
            ? "Space"
            : e.key.length === 1
              ? keyCode(e.key)
              : (NAMED_KEYS[e.key.toLowerCase()] ?? e.key);
    if (typed) {
        const byKey = chordString(mods, typed);
        if (!chords.includes(byKey)) {
            chords.push(byKey);
        }
    }
    return chords;
}

// ── Display ───────────────────────────────────────────────────────────────────

/** A chord's parts, in the shape of aesthetic's `Chord` (for a future help pane). */
export interface ChordParts {
    key: string; // lowercase name: "q", "7", ",", "up", "esc", "enter", "pageup", "f5"
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
    anyShift: false; // (buche's chords always say whether Shift is held)
}

/** The key's lowercase name, from its code. */
function keyName(code: string): string {
    const m = /^(?:Key|Digit)(.)$/.exec(code);
    if (m) {
        return m[1].toLowerCase();
    }
    const arrow = /^Arrow(Left|Right|Up|Down)$/.exec(code);
    if (arrow) {
        return arrow[1].toLowerCase();
    }
    if (code in PUNCTUATION_CODES) {
        return PUNCTUATION_CODES[code];
    }
    if (code === "Escape") {
        return "esc";
    }
    return code.toLowerCase();
}

/** The parts of a canonical chord ("Alt+KeyQ", "Shift+ArrowLeft"). */
export function chordParts(chord: string): ChordParts {
    const parts = chord.split("+");
    const code = parts.pop() ?? "";
    const mods = new Set(parts);
    return {
        key: keyName(code),
        ctrl: mods.has("Ctrl"),
        alt: mods.has("Alt"),
        shift: mods.has("Shift"),
        meta: mods.has("Meta"),
        anyShift: false,
    };
}

const KEY_LABELS: Record<string, string> = {
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    enter: "Enter",
    esc: "Esc",
    tab: "Tab",
    space: "Space",
    home: "Home",
    end: "End",
    pageup: "PgUp",
    pagedown: "PgDn",
};

/** A key's label, as shown. */
function keyLabel(key: string, mac: boolean): string {
    if (key === "backspace") {
        return mac ? "⌫" : "Backspace";
    }
    if (key === "delete") {
        return mac ? "⌦" : "Del";
    }
    if (key in KEY_LABELS) {
        return KEY_LABELS[key];
    }
    if (key.length === 1) {
        return key.toUpperCase();
    }
    return key[0].toUpperCase() + key.slice(1);
}

/** A canonical chord as shown to the user: "⌥Q" on a Mac, "Alt+Q" elsewhere. */
export function chordLabel(chord: string, mac: boolean): string {
    const p = chordParts(chord);
    const label = keyLabel(p.key, mac);
    if (mac) {
        return (
            (p.ctrl ? "⌃" : "") +
            (p.alt ? "⌥" : "") +
            (p.shift ? "⇧" : "") +
            (p.meta ? "⌘" : "") +
            label
        );
    }
    const mods = (
        [
            [p.ctrl, "Ctrl"],
            [p.alt, "Alt"],
            [p.shift, "Shift"],
            [p.meta, "Meta"],
        ] as const
    )
        .filter(([on]) => on)
        .map(([, name]) => name);
    return [...mods, label].join("+");
}
