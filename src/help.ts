// What the help lists (see components/help-pane.ts): every action bound to a
// key, with the shortcuts that run it (as the keymap matches them: see
// bindings.ts) and where they work, and the modes. Pure: from the rules.

import { type ActionRef, actions, refKey } from "./actions.ts";
import {
    ANYWHERE,
    type Location,
    type Shortcut,
    shortcutLabel,
    shortcutsFor,
} from "./bindings.ts";
import { bindingChord } from "./chords.ts";
import type { ModeSpec, Rule } from "./config.ts";
import type { Action } from "./types.ts";

export interface HelpShortcut {
    shortcut: Shortcut;
    /** Where it works, when not everywhere: "in a prompt"... */
    where: string | null;
}

export interface HelpEntry {
    /** Its reference (null: a mode's entry, a prompt's binding). */
    ref: ActionRef | null;
    title: string;
    description: string;
    categories: string[];
    shortcuts: HelpShortcut[];
    /** What its key does instead (one of the rules takes it first): it is shown dimmed. */
    shadowedBy?: string;
}

/** Where shortcuts are looked for, everywhere first. */
const PLACES: [Location, string | null][] = [
    [ANYWHERE, null],
    [{ ...ANYWHERE, inPrompt: true }, "in a prompt"],
    [{ ...ANYWHERE, inPTY: true }, "in a terminal"],
    [{ ...ANYWHERE, inFrame: true }, "in a GUI"],
];

const HOLD_NAMES: Record<string, string> = {
    Alt: "Alt",
    Ctrl: "Ctrl",
    Shift: "Shift",
    Meta: "Cmd",
};

/** The help's entries: the modes, then each action bound to a key, in the rules' order. */
export function helpEntries(rules: Rule[]): HelpEntry[] {
    const modes = new Map<string, { spec: ModeSpec; rule: Rule }>();
    for (const r of rules) {
        if (r.mode) {
            modes.set(r.mode.name, { spec: r.mode, rule: r });
        }
    }
    const entries: HelpEntry[] = [...modes.values()].map(({ spec, rule }) => ({
        ref: null,
        title: `${spec.name[0].toUpperCase()}${spec.name.slice(1)} mode`,
        description: `Enter the ${spec.name} mode: it lasts while ${HOLD_NAMES[spec.hold] ?? spec.hold} is held, for the keys that follow`,
        categories: ["modes"],
        shortcuts: [{ shortcut: { keys: [], mode: spec, rule }, where: null }],
    }));

    const seen = new Set<string>();
    for (const r of rules) {
        const key = refKey(r.ref);
        if (r.mode || seen.has(key)) {
            continue;
        }
        seen.add(key);
        const shortcuts: HelpShortcut[] = [];
        for (const [loc, where] of PLACES) {
            for (const shortcut of shortcutsFor(rules, r.ref, loc)) {
                if (!shortcuts.some((s) => s.shortcut.rule === shortcut.rule)) {
                    shortcuts.push({ shortcut, where });
                }
            }
        }
        // (Every key for it taken by later rules: nothing to show.)
        if (!shortcuts.length) {
            continue;
        }
        entries.push({
            ref: r.ref,
            title: actions.title(r.ref),
            description: actions.description(r.ref),
            categories: actions.get(r.ref.id)?.categories ?? [],
            shortcuts,
        });
    }
    return entries;
}

/** The categories of the entries, in the order they first appear ("advanced" last). */
export function helpCategories(entries: HelpEntry[]): string[] {
    const all = [...new Set(entries.flatMap((e) => e.categories))];
    return [...all.filter((c) => c !== "advanced"), ...all.filter((c) => c === "advanced")];
}

/** The words a modifier is searched by. */
const MOD_WORDS: Record<string, string> = {
    "⌃": "ctrl control",
    "⌥": "alt opt option",
    "⇧": "shift",
    "⌘": "meta cmd command",
};

/** What an entry is found by: its words, its keys (both ways of writing them), where. */
export function helpHaystack(e: HelpEntry): string {
    const keys = e.shortcuts.map((s) => shortcutLabel(s.shortcut, true));
    return [
        e.title,
        e.description,
        ...e.categories,
        ...keys,
        ...e.shortcuts.map((s) => `${shortcutLabel(s.shortcut, false)} ${s.where ?? ""}`),
        // (Modifier words: "cmd" finds ⌘.)
        ...Object.entries(MOD_WORDS)
            .filter(([glyph]) => keys.some((k) => k.includes(glyph)))
            .map(([, words]) => words),
    ]
        .join(" ")
        .toLowerCase();
}

/** The entries matching a search (every word of it), and shown with these categories on
 *  (an entry shows when all of its categories are on). */
export function filterHelp(
    entries: HelpEntry[],
    search: string,
    hidden: ReadonlySet<string>,
): { found: HelpEntry[]; shown: HelpEntry[] } {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    const found = entries.filter((e) => {
        const hay = helpHaystack(e);
        return terms.every((t) => hay.includes(t));
    });
    const shown = found.filter((e) => e.categories.every((c) => !hidden.has(c)));
    return { found, shown };
}

// ── Prompts' bindings ─────────────────────────────────────────────────────────
// A prompt's driver binds keys of its own (see PromptCell.bindings): in the
// prompt, and, those marked `inherit`, in the cells under it too (the closest
// prompt's binding for a key wins). They say what they do in their `title`
// and `description`, if they do; else a built-in has a name, and a command is
// shown as is (coquille gives its built-ins a title and description; another
// driver's built-in without one shows its name). They are filed under their
// `categories` (coquille puts all of its own in "cq"), else under "prompt".

/** A prompt's bindings, for the help. */
export interface PromptBindingsSource {
    /** The prompt's name (its label). */
    label: string;
    bindings: Record<string, Action>;
    /** The prompt the help is about (all its bindings work), or one above
     *  it (only its inherited ones do). */
    own: boolean;
}

/** The prompt's virtual keys (see chords.ts): an arrow at the edge of the text. */
const VIRTUAL_KEYS: Record<string, [code: string, where: string]> = {
    Previous: ["ArrowUp", "on the first line"],
    Next: ["ArrowDown", "on the last line"],
};

/** Where a prompt's action is filed: its categories, else "prompt". */
function categoriesOf(action: Action): string[] {
    const own = typeof action === "object" ? action.categories : undefined;
    return own?.length ? own : ["prompt"];
}

/** What a prompt's action says it does. */
function describeAction(action: Action): { title: string; description: string } {
    if (typeof action === "string") {
        return { title: action, description: "" };
    }
    // (A driver says what its built-ins do, as coquille does; else, its name.)
    const title = action.title ?? ("builtin" in action ? action.builtin : action.command);
    // (With a title of its own, a command still says what it runs.)
    const description =
        action.description ?? (action.title && "command" in action ? action.command : "");
    return { title, description };
}

/** The prompts' bindings (the closest prompt first), as help entries. A key
 *  one of the rules takes first says which (`shadowedBy`). */
export function promptHelpEntries(
    sources: PromptBindingsSource[],
    rules: Rule[],
    mac: boolean,
): HelpEntry[] {
    const taken = new Set<string>();
    const entries: HelpEntry[] = [];
    for (const source of sources) {
        for (const [key, action] of Object.entries(source.bindings)) {
            const inherits = typeof action === "object" && !!action.inherit;
            if (!source.own && !inherits) {
                continue;
            }
            // (As the prompt matches it: see PromptCell.bound.)
            const bound = bindingChord(key, mac);
            const virtual = bound ? VIRTUAL_KEYS[bound] : undefined;
            const chord = virtual ? virtual[0] : bound;
            if (!chord || taken.has(chord)) {
                continue;
            }
            taken.add(chord);
            const where = [
                source.own
                    ? inherits
                        ? "in the prompt and its cells"
                        : "in the prompt"
                    : `from ${source.label}`,
                virtual?.[1],
            ]
                .filter(Boolean)
                .join(", ");
            const loc = source.own ? { ...ANYWHERE, inPrompt: true } : ANYWHERE;
            const taker = rules.findLast(
                (r) =>
                    !r.mode &&
                    r.keys[0] === chord &&
                    (!r.when || r.when.test({ ...loc, mode: "" })),
            );
            entries.push({
                ref: null,
                ...describeAction(action),
                categories: categoriesOf(action),
                shortcuts: [{ shortcut: { keys: [chord], mode: null, rule: null }, where }],
                ...(taker && { shadowedBy: actions.title(taker.ref) }),
            });
        }
    }
    return entries;
}
