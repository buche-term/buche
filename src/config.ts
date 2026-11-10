// Buche's configuration (YAML, see config/default.yaml). Its `bindings` are
// a list of rules, as VS Code's keybindings: a key (a chord, or a sequence of
// them: "i enter"), an action, and optionally a condition (`when`) and the
// action's arguments (`args`). Layers (the defaults, then the user's) are
// concatenated; on a key press, the last rule for it whose condition holds
// wins (see keymap.ts). `action: -name` removes the rules before it for that
// action (and key, and condition, if given).
//
// Modes are entered with the `setMode` action: e.g. `{ key: alt+q, action:
// setMode, args: { mode: nav, hold: alt } }` enters the `nav` mode, which
// lasts while Alt is held (its key, pressed again meanwhile, does nothing).
// In a mode, the layout is in carreau's navigation mode, and the mode's
// modifier is left out of chords:
// `{ key: left, action: focusLeft, when: mode == nav }` is Alt+Left, or Left.
//
// Conditions: `mode` (the mode on, "" if none), `inPrompt`, `inPTY` (an
// embedded terminal), `inFrame` (a GUI cell's iframe); with `==`, `!=`, `!`,
// `&&`, `||` and parentheses. Inside GUI iframes, only the rules that can
// apply there (see `frameChords`) take keys from the page in the iframe.
//
// Reading the file is the launcher's (scripts/user-config.ts): this module is
// pure, so the renderer can resolve the config it is handed, and report
// what's wrong in it.

import type { Modifier } from "carreau";
import { type ActionRef, type Args, actions, refKey } from "./actions.ts";
import { type Chord, chordString, type Mod, parseChord, type Side } from "./chords.ts";

export { canonicalChord, eventChords, type Mod, type Side } from "./chords.ts";

/** The configuration, as parsed from YAML. */
export interface BucheConfig {
    bindings?: unknown;
    shell?: unknown;
}

/**
 * The shell: the program a window starts with (and the "Shell" choice of a
 * new tab). `command` is run as a command line: a name on PATH, or a path to
 * an executable (`~/` is the home directory). With `github`, the executables
 * of the repository's latest release in `version` (a semver range) for this
 * platform are installed (see scripts/tools.ts) in a directory put first on
 * PATH; `command` then defaults to the repository's name. `assets`: the names
 * of the release's archives to install (their part before the platform, e.g.
 * "coquille" for coquille-aarch64-apple-darwin.tar.xz); default: all of them.
 */
export interface ShellConfig {
    command: string;
    github?: string;
    version?: string;
    assets?: string[];
}

/**
 * Resolve configs' shell: the last layer that has one wins, as a whole (a
 * user's `shell` is not merged with the defaults'). `shell: CMD` is short for
 * `shell: { command: CMD }`. What is wrong is reported in `errors`, and the
 * layer is skipped.
 */
export function resolveShell(layers: (BucheConfig | null | undefined)[]): {
    shell: ShellConfig | null;
    errors: string[];
} {
    const errors: string[] = [];
    let shell: ShellConfig | null = null;
    layers.forEach((config, layer) => {
        const raw = config?.shell;
        if (raw === undefined || raw === null) {
            return;
        }
        const where = `shell${layer < layers.length - 1 ? " (in the defaults)" : ""}`;
        const fail = (message: string) => errors.push(`${where}: ${message}`);
        if (typeof raw === "string") {
            if (raw.trim()) {
                shell = { command: raw };
            } else {
                fail("empty command");
            }
            return;
        }
        if (typeof raw !== "object" || Array.isArray(raw)) {
            fail("expected a command, or { command, github, version, assets }");
            return;
        }
        const { command, github, version, assets, ...rest } = raw as Record<string, unknown>;
        const unknown = Object.keys(rest);
        if (unknown.length) {
            fail(`unknown field(s): ${unknown.join(", ")}`);
            return;
        }
        if (command !== undefined && (typeof command !== "string" || !command.trim())) {
            fail("`command` must be a non-empty string");
            return;
        }
        if (
            github !== undefined &&
            (typeof github !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(github))
        ) {
            fail("`github` must be OWNER/REPO");
            return;
        }
        if (version !== undefined && (typeof version !== "string" || github === undefined)) {
            fail("`version` must be a string, and goes with `github`");
            return;
        }
        if (
            assets !== undefined &&
            (github === undefined ||
                !Array.isArray(assets) ||
                !assets.every((a) => typeof a === "string"))
        ) {
            fail("`assets` must be a list of names, and goes with `github`");
            return;
        }
        const name = typeof github === "string" ? github.split("/")[1] : undefined;
        const cmd = (command as string | undefined) ?? name;
        if (!cmd) {
            fail("needs a `command` (or a `github` repository)");
            return;
        }
        shell = {
            command: cmd,
            ...(github !== undefined && { github: github as string }),
            ...(version !== undefined && { version: version as string }),
            ...(assets !== undefined && { assets: assets as string[] }),
        };
    });
    return { shell, errors };
}

/** Carreau's name for a modifier (its `activation.modifier`). */
export const CARREAU_MOD: Record<Mod, Modifier> = {
    Shift: "Shift",
    Alt: "Alt",
    Ctrl: "Control",
    Meta: "Meta",
};

// ── Conditions ────────────────────────────────────────────────────────────────

/** What conditions are evaluated on. */
export interface Context {
    /** The mode on ("" if none). */
    mode: string;
    inPrompt: boolean;
    inPTY: boolean;
    inFrame: boolean;
}

const CONTEXT_KEYS = new Set(["mode", "inPrompt", "inPTY", "inFrame"]);

/** A parsed condition. */
export interface Condition {
    text: string;
    test: (ctx: Context) => boolean;
    /** Whether it depends on `mode`, and the modes it names. */
    usesMode: boolean;
    modes: string[];
}

/** Parse a `when` condition. Throws (a message) if malformed. */
export function parseCondition(text: string): Condition {
    const tokens =
        text.match(/\s*(==|!=|&&|\|\||!|\(|\)|'[^']*'|"[^"]*"|[A-Za-z_][\w.-]*|\S)/g) ?? [];
    const toks = tokens.map((t) => t.trim());
    let i = 0;
    let usesMode = false;
    const modes: string[] = [];
    const peek = () => toks[i];
    const expect = (t: string) => {
        if (toks[i] !== t) {
            throw new Error(`expected ${t}${toks[i] ? ` at "${toks[i]}"` : " at the end"}`);
        }
        i++;
    };
    type Test = (ctx: Context) => boolean;
    const value = (): string => {
        const t = toks[i++];
        if (t === undefined) {
            throw new Error("expected a value at the end");
        }
        if (/^['"]/.test(t)) {
            return t.slice(1, -1);
        }
        if (!/^[A-Za-z_]/.test(t)) {
            throw new Error(`expected a value at "${t}"`);
        }
        return t;
    };
    const primary = (): Test => {
        const t = peek();
        if (t === "(") {
            i++;
            const inner = or();
            expect(")");
            return inner;
        }
        if (t === undefined || !/^[A-Za-z_]/.test(t)) {
            throw new Error(t === undefined ? "unexpected end" : `unexpected "${t}"`);
        }
        i++;
        if (!CONTEXT_KEYS.has(t)) {
            throw new Error(`unknown context "${t}" (known: ${[...CONTEXT_KEYS].join(", ")})`);
        }
        const key = t as keyof Context;
        if (key === "mode") {
            usesMode = true;
        }
        const op = peek();
        if (op === "==" || op === "!=") {
            i++;
            const v = value();
            if (key === "mode") {
                modes.push(v);
            }
            return op === "==" ? (ctx) => String(ctx[key]) === v : (ctx) => String(ctx[key]) !== v;
        }
        return (ctx) => !!ctx[key];
    };
    const unary = (): Test => {
        if (peek() === "!") {
            i++;
            const inner = unary();
            return (ctx) => !inner(ctx);
        }
        return primary();
    };
    const and = (): Test => {
        let left = unary();
        while (peek() === "&&") {
            i++;
            const l = left;
            const r = unary();
            left = (ctx) => l(ctx) && r(ctx);
        }
        return left;
    };
    const or = (): Test => {
        let left = and();
        while (peek() === "||") {
            i++;
            const l = left;
            const r = and();
            left = (ctx) => l(ctx) || r(ctx);
        }
        return left;
    };
    const test = or();
    if (i < toks.length) {
        throw new Error(`unexpected "${toks[i]}"`);
    }
    return { text, test, usesMode, modes };
}

// ── Rules ─────────────────────────────────────────────────────────────────────

/** A mode, as `setMode` enters it. */
export interface ModeSpec {
    name: string;
    /** The modifier held for the mode to last, and on which side. */
    hold: Mod;
    side: Side;
    /** The key entering it (its code): pressed again meanwhile, it does nothing. */
    code: string;
}

/** A binding, resolved. */
export interface Rule {
    /** Its chords (more than one: a sequence), in the canonical form. */
    keys: string[];
    /** The action's name, as written (an id, or an alias: see actions.ts). */
    action: string;
    /** Its arguments, as written. */
    args: Record<string, unknown>;
    /** The action, resolved (see actions.ts). */
    ref: ActionRef;
    when: Condition | null;
    /** For setMode: the mode. */
    mode?: ModeSpec;
    /** Where it comes from, for messages. */
    origin: string;
}

const isTable = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

/** Used when no rule enters a mode. */
const FALLBACK_MODE: ModeSpec = {
    name: "nav",
    hold: "Alt",
    side: "either",
    code: "KeyQ",
};

/**
 * Resolve configs' bindings: layers (the defaults, then the user's), their
 * rules one after the other (see the top of this module). What is wrong is
 * reported in `errors` and left out; if no rule is left to enter a mode, one
 * is added (Alt+Q: nav), so that a mistake never leaves the user without a
 * way to navigate. `mac`: whether `Mod` means Cmd (else Ctrl).
 */
export function resolveBindings(
    layers: (BucheConfig | null | undefined)[],
    mac: boolean,
): { rules: Rule[]; errors: string[] } {
    const errors: string[] = [];
    let rules: Rule[] = [];
    layers.forEach((config, layer) => {
        const defaults = layer < layers.length - 1;
        const list = config?.bindings;
        if (list === undefined || list === null) {
            return;
        }
        if (!Array.isArray(list)) {
            errors.push(
                `bindings: expected a list of { key, action, when, args }${defaults ? " (in the defaults)" : ""}`,
            );
            return;
        }
        list.forEach((entry, i) => {
            const origin = `bindings[${i}]${defaults ? " (in the defaults)" : ""}`;
            try {
                const rule = resolveRule(entry, origin, mac);
                if (rule.action.startsWith("-")) {
                    // A plain name removes all of the action's rules; with
                    // arguments, or an alias (insertLeft), only the matching
                    // ones (setMode's: by name, as its arguments are a mode's).
                    const name = rule.action.slice(1);
                    const target = rule.ref;
                    const specific =
                        name !== "setMode" &&
                        (Object.keys(rule.args).length > 0 ||
                            actions.aliases()[name] !== undefined);
                    const wanted = specific
                        ? refKey(actions.resolve(name, rule.args as Args))
                        : null;
                    const key = rule.keys.join(" ");
                    rules = rules.filter(
                        (r) =>
                            !(
                                r.ref.id === target.id &&
                                (wanted === null || refKey(r.ref) === wanted) &&
                                (!key || r.keys.join(" ") === key) &&
                                (!rule.when || r.when?.text === rule.when.text)
                            ),
                    );
                } else {
                    rules.push(rule);
                }
            } catch (e) {
                const what =
                    isTable(entry) && typeof entry.key === "string" ? ` (${entry.key})` : "";
                errors.push(`${origin}${what}: ${(e as Error).message}`);
            }
        });
    });

    // The modes entered, and the ones named in conditions.
    const modes = new Map<string, ModeSpec>();
    for (const r of rules) {
        if (r.mode) {
            const other = modes.get(r.mode.name);
            if (other && other.hold !== r.mode.hold) {
                errors.push(
                    `${r.origin}: mode ${r.mode.name} is entered elsewhere with another hold`,
                );
            }
            modes.set(r.mode.name, r.mode);
        }
    }
    if (modes.size === 0) {
        errors.push("bindings: no rule enters a mode (setMode): using Alt+Q for nav");
        rules.unshift({
            keys: ["Alt+KeyQ"],
            action: "setMode",
            args: { mode: "nav", hold: "alt" },
            ref: { id: "setMode" },
            when: null,
            mode: FALLBACK_MODE,
            origin: "fallback",
        });
        modes.set("nav", FALLBACK_MODE);
    }
    for (const r of rules) {
        for (const m of r.when?.modes ?? []) {
            if (!modes.has(m)) {
                errors.push(`${r.origin}: no rule enters the mode "${m}" (setMode)`);
            }
        }
    }
    return { rules, errors };
}

/** A rule from a config entry. Throws (a message) if wrong. */
function resolveRule(entry: unknown, origin: string, mac: boolean): Rule {
    if (!isTable(entry)) {
        throw new Error("expected { key, action, when, args }");
    }
    for (const k of Object.keys(entry)) {
        if (!["key", "action", "when", "args"].includes(k)) {
            throw new Error(`unknown field "${k}" (fields: key, action, when, args)`);
        }
    }
    const { key, action, when, args } = entry;
    if (typeof action !== "string" || !action) {
        throw new Error("no action");
    }
    const removal = action.startsWith("-");
    const name = removal ? action.slice(1) : action;
    if (args !== undefined && !isTable(args)) {
        throw new Error("args: expected a table");
    }
    const ref = resolveAction(name, args as Args | undefined, removal);
    if (when !== undefined && typeof when !== "string") {
        throw new Error(`when: expected a condition (quote it if it starts with "!")`);
    }
    if (key !== undefined && typeof key !== "string") {
        throw new Error("key: expected a chord, e.g. ctrl+p (quote it if it has , [ ] or {)");
    }
    if (!removal && !key) {
        throw new Error("no key");
    }
    let condition: Condition | null = null;
    if (when) {
        try {
            condition = parseCondition(when);
        } catch (e) {
            throw new Error(`when: ${(e as Error).message}`);
        }
    }
    const chords = (key ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((text) => {
            const chord = parseChord(text, mac);
            if (chord.side !== "either") {
                throw new Error(`${text}: a modifier's side is for setMode's hold, not keys`);
            }
            return chord;
        });
    const rule: Rule = {
        keys: chords.map((c) => chordString(c.mods, c.code)),
        action,
        args: args ?? {},
        ref,
        when: condition,
        origin,
    };
    if (removal) {
        return rule;
    }
    if (name === "setMode") {
        rule.mode = resolveMode(chords, rule.args, mac);
        return rule;
    }
    // Rules out of any mode take their keys from typing: they need Ctrl, Alt
    // or Cmd (or a function key).
    const [first] = chords;
    const typing = !(["Ctrl", "Alt", "Meta"] as Mod[]).some((m) => first.mods.has(m));
    if (typing && !/^F\d+$/.test(first.code) && !condition?.usesMode) {
        throw new Error("a key without Ctrl, Alt or Cmd needs a mode (when: mode == ...)");
    }
    return rule;
}

/**
 * An action's reference, from its name and arguments (see actions.ts).
 * Throws (a message) if wrong. For a removal, the arguments are not checked
 * (see resolveBindings), and an action that requires some is referred to by
 * its id alone.
 */
function resolveAction(name: string, args: Args | undefined, removal: boolean): ActionRef {
    // (setMode's arguments are checked by resolveMode, with its own messages.)
    if (name === "setMode") {
        return { id: "setMode" };
    }
    if (removal) {
        const id = actions.aliases()[name]?.id ?? name;
        const def = actions.get(id);
        if (!def) {
            throw new Error(`unknown action "${name}"`);
        }
        const required = Object.values(def.params ?? {}).some((p) => p.default === undefined);
        return required && actions.aliases()[name] === undefined ? { id } : actions.resolve(name);
    }
    return actions.resolve(name, args);
}

/** setMode's mode, from its key and args. Throws (a message) if wrong. */
function resolveMode(chords: Chord[], args: Record<string, unknown>, mac: boolean): ModeSpec {
    const { mode, hold } = args;
    for (const k of Object.keys(args)) {
        if (!["mode", "hold"].includes(k)) {
            throw new Error(`setMode: unknown argument "${k}" (mode, hold)`);
        }
    }
    if (typeof mode !== "string" || !/^[A-Za-z_][\w-]*$/.test(mode)) {
        throw new Error("setMode: args.mode: expected a name, e.g. nav");
    }
    if (typeof hold !== "string") {
        throw new Error("setMode: args.hold: expected the modifier to hold, e.g. alt");
    }
    let held: Chord;
    try {
        held = parseChord(`${hold}+x`, mac);
    } catch {
        throw new Error(`setMode: args.hold: "${hold}" is not a modifier`);
    }
    if (held.mods.size !== 1) {
        throw new Error("setMode: args.hold: one modifier");
    }
    const [mod] = held.mods;
    if (chords.length !== 1) {
        throw new Error("setMode: one chord, not a sequence");
    }
    const [chord] = chords;
    if (chord.mods.size !== 1 || !chord.mods.has(mod)) {
        throw new Error(`setMode: the key's only modifier must be the one held (${mod})`);
    }
    return { name: mode, hold: mod, side: held.side, code: chord.code };
}

/**
 * The chords a GUI iframe hands to the page: the first ones of the rules
 * that can apply there (their condition holds in a frame, out of any mode).
 */
export function frameChords(rules: Rule[]): string[] {
    const ctx: Context = { mode: "", inPrompt: false, inPTY: false, inFrame: true };
    const chords = rules.filter((r) => !r.when || r.when.test(ctx)).map((r) => r.keys[0]);
    return [...new Set(chords)];
}
