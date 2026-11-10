// @vitest-environment node

import { describe, expect, test } from "vitest";
import type { ActionRef } from "../src/actions.ts";
import {
    ANYWHERE,
    type Location,
    type Shortcut,
    shortcutLabel,
    shortcutsFor,
} from "../src/bindings.ts";
import { type BucheConfig, resolveBindings } from "../src/config.ts";
import { defaultConfig } from "./default-config.ts";

const rulesWith = (user?: BucheConfig) => {
    const { rules, errors } = resolveBindings([defaultConfig, user], false);
    expect(errors).toEqual([]);
    return rules;
};
const labels = (
    ref: ActionRef,
    opts: { user?: BucheConfig; loc?: Location; mac?: boolean } = {},
) =>
    shortcutsFor(rulesWith(opts.user), ref, opts.loc).map((s) =>
        shortcutLabel(s, opts.mac ?? false),
    );

describe("shortcutsFor", () => {
    test("a key in a mode", () => {
        expect(labels({ id: "closeTab" })).toEqual(["Alt+q·w"]);
    });

    test("references with arguments", () => {
        expect(labels({ id: "insert", args: { target: "left", into: false } })).toEqual([
            "Alt+q·i·Shift+←",
        ]);
        expect(labels({ id: "insert", args: { target: "left", into: true } })).toEqual([
            "Alt+q·i·←",
        ]);
    });

    test("with and without a mode", () => {
        const found = shortcutsFor(rulesWith(), { id: "nextTab" });
        const ls = found.map((s) => shortcutLabel(s, false));
        expect(ls).toEqual(expect.arrayContaining(["Ctrl+Tab", "Alt+q·."]));
        expect(found.some((s) => s.mode === null)).toBe(true);
        expect(found.some((s) => s.mode?.name === "nav")).toBe(true);
    });

    test("where a condition holds", () => {
        expect(labels({ id: "clearPrompt" })).toEqual([]);
        expect(labels({ id: "clearPrompt" }, { loc: { ...ANYWHERE, inPrompt: true } })).toEqual([
            "Ctrl+l",
        ]);
    });

    test("shadowed by a later rule for the same key", () => {
        const user = { bindings: [{ key: "w", action: "kill", when: "mode == nav" }] };
        expect(labels({ id: "closeTab" }, { user })).toEqual([]);
        expect(labels({ id: "kill" }, { user })[0]).toBe("Alt+q·w");
    });

    test("removed", () => {
        expect(
            labels({ id: "closeTab" }, { user: { bindings: [{ action: "-closeTab" }] } }),
        ).toEqual([]);
    });

    test("on a Mac", () => {
        expect(labels({ id: "closeTab" }, { mac: true })).toEqual(["⌥q·w"]);
    });
});

describe("shortcutLabel", () => {
    const nav = { name: "nav", hold: "Alt", side: "either", code: "KeyQ" } as const;
    const label = (keys: string[], mode: boolean, mac: boolean) =>
        shortcutLabel({ keys, mode: mode ? nav : null, rule: null } as unknown as Shortcut, mac);

    test.each([
        // A dot between keys; a key's own modifiers stay on it.
        [["KeyW"], true, "⌥q·w", "Alt+q·w"],
        [["KeyI", "ArrowLeft"], true, "⌥q·i·←", "Alt+q·i·←"],
        [["Period"], true, "⌥q·.", "Alt+q·."],
        [["KeyI", "Shift+ArrowLeft"], true, "⌥q·i·⇧←", "Alt+q·i·Shift+←"],
        [["KeyI", "Enter"], true, "⌥q·i·Enter", "Alt+q·i·Enter"],
        [["Enter", "KeyW"], true, "⌥q·Enter·w", "Alt+q·Enter·w"],
        [["Shift+KeyG"], true, "⌥q·⇧g", "Alt+q·Shift+g"],
        // Out of a mode.
        [["Ctrl+Tab"], false, "⌃Tab", "Ctrl+Tab"],
        [["Meta+KeyP"], false, "⌘p", "Meta+p"],
        [["Shift+Ctrl+Tab"], false, "⌃⇧Tab", "Ctrl+Shift+Tab"],
        [["F5"], false, "F5", "F5"],
        [["Ctrl+Backspace"], false, "⌃⌫", "Ctrl+Backspace"],
    ])("%j (mode: %s) → %s / %s", (keys, mode, mac, other) => {
        expect(label(keys, mode, true)).toBe(mac);
        expect(label(keys, mode, false)).toBe(other);
    });
});
