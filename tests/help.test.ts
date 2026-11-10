// @vitest-environment node

import { describe, expect, test } from "vitest";
import { shortcutLabel } from "../src/bindings.ts";
import { resolveBindings } from "../src/config.ts";
import {
    filterHelp,
    type HelpEntry,
    helpCategories,
    helpEntries,
    promptHelpEntries,
} from "../src/help.ts";
import { defaultConfig } from "./default-config.ts";

const entries = (() => {
    const { rules, errors } = resolveBindings([defaultConfig], false);
    expect(errors).toEqual([]);
    return helpEntries(rules);
})();
const byTitle = (title: string) => entries.find((e) => e.title === title);
const keys = (e: HelpEntry | undefined, mac = false) =>
    e?.shortcuts.map((s) => shortcutLabel(s.shortcut, mac) + (s.where ? ` (${s.where})` : ""));

describe("helpEntries", () => {
    test("the modes first, by the key entering them", () => {
        expect(entries[0].title).toBe("Nav mode");
        expect(entries[0].ref).toBeNull();
        expect(keys(entries[0])).toEqual(["Alt+q"]);
        expect(keys(entries[0], true)).toEqual(["⌥q"]);
    });

    test("each bound action once, with all its shortcuts", () => {
        expect(keys(byTitle("Close tab"))).toEqual(["Alt+q·w"]);
        expect(keys(byTitle("Next tab"))).toEqual(expect.arrayContaining(["Ctrl+Tab", "Alt+q·."]));
        expect(keys(byTitle("Help"))).toEqual(["Alt+q·Shift+/"]);
        expect(entries.filter((e) => e.title === "Close tab")).toHaveLength(1);
        // (setMode's rules are the modes' entries.)
        expect(entries.some((e) => e.ref?.id === "setMode")).toBe(false);
    });

    test("where a shortcut works, when not everywhere", () => {
        expect(keys(byTitle("Clear the prompt's finished cells"))).toEqual([
            "Ctrl+l (in a prompt)",
        ]);
    });

    test("categories: in order of appearance, advanced last", () => {
        const cats = helpCategories(entries);
        expect(cats[0]).toBe("modes");
        expect(cats.at(-1)).toBe("advanced");
        expect(cats).toEqual(expect.arrayContaining(["tabs", "layout", "cells", "help"]));
    });
});

describe("filterHelp", () => {
    const titles = (es: HelpEntry[]) => es.map((e) => e.title);

    test("every word of the search, in titles, descriptions, keys", () => {
        expect(titles(filterHelp(entries, "close tab", new Set()).found)).toEqual(
            expect.arrayContaining(["Close tab", "Close tab now"]),
        );
        expect(titles(filterHelp(entries, "alt+q·w", new Set()).found)).toEqual(["Close tab"]);
        // A modifier by its name: ⌃ is ctrl, not cmd.
        expect(titles(filterHelp(entries, "control", new Set()).found)).toContain("Next tab");
        expect(titles(filterHelp(entries, "command", new Set()).found)).not.toContain("Next tab");
    });

    test("an entry shows when all its categories are on", () => {
        const { found, shown } = filterHelp(entries, "close tab", new Set(["advanced"]));
        expect(titles(found)).toContain("Close tab now");
        expect(titles(shown)).not.toContain("Close tab now");
        expect(titles(shown)).toContain("Close tab");
        expect(
            filterHelp(entries, "", new Set(["tabs"])).shown.some((e) =>
                e.categories.includes("tabs"),
            ),
        ).toBe(false);
    });
});

describe("promptHelpEntries", () => {
    const { rules } = resolveBindings([defaultConfig], false);
    const cq = {
        "ctrl+t": {
            command: "@pop sel fzf",
            title: "Pick a file",
            description: "Pick files with fzf",
        },
        "ctrl+b": { command: "@pop sel bed", inherit: true },
        // (As coquille sends its built-ins: with what they do.)
        Enter: {
            builtin: "submit",
            freeze: true,
            title: "Run the command",
            description: "Run what is typed, and add it to the history",
        },
        Previous: {
            builtin: "previous",
            title: "Previous command",
            description: "Go back in the history",
        },
        "ctrl+l": "clear",
        "alt+x": { builtin: "fancy" },
    };
    const describe_ = (es: HelpEntry[]) =>
        es.map((e) => [keys(e)?.[0], e.title, e.description, e.shadowedBy ?? null]);

    test("in its prompt: all its bindings, with their titles, or what they run", () => {
        expect(
            describe_(promptHelpEntries([{ label: "cq", bindings: cq, own: true }], rules, false)),
        ).toEqual([
            ["Ctrl+t (in the prompt)", "Pick a file", "Pick files with fzf", null],
            ["Ctrl+b (in the prompt and its cells)", "@pop sel bed", "", null],
            [
                "Enter (in the prompt)",
                "Run the command",
                "Run what is typed, and add it to the history",
                null,
            ],
            [
                "↑ (in the prompt, on the first line)",
                "Previous command",
                "Go back in the history",
                null,
            ],
            // (Ctrl+L, in a prompt, is buche's.)
            ["Ctrl+l (in the prompt)", "clear", "", "Clear the prompt's finished cells"],
            // (Another driver's built-in: its name.)
            ["Alt+x (in the prompt)", "fancy", "", null],
        ]);
    });

    test("in a cell: the inherited ones of the prompts above, the closest first", () => {
        const sources = [
            {
                label: "inner",
                bindings: { "ctrl+b": { command: "inner b", inherit: true } },
                own: false,
            },
            { label: "cq", bindings: cq, own: false },
        ];
        expect(describe_(promptHelpEntries(sources, rules, false))).toEqual([
            ["Ctrl+b (from inner)", "inner b", "", null],
        ]);
    });

    test("a command with a title still says what it runs", () => {
        const [e] = promptHelpEntries(
            [
                {
                    label: "cq",
                    bindings: { "ctrl+t": { command: "fzf", title: "Pick" } },
                    own: true,
                },
            ],
            rules,
            false,
        );
        expect([e.title, e.description]).toEqual(["Pick", "fzf"]);
    });
});

describe("prompt bindings' categories", () => {
    const { rules } = resolveBindings([defaultConfig], false);
    const entries = promptHelpEntries(
        [
            {
                label: "cq",
                bindings: {
                    "ctrl+t": { command: "fzf", title: "Pick", categories: ["cq", "files"] },
                    "ctrl+d": { builtin: "close", categories: ["cq"] },
                    "ctrl+y": "yank",
                },
                own: true,
            },
        ],
        rules,
        false,
    );

    test("their own, else prompt", () => {
        expect(entries.map((e) => e.categories)).toEqual([["cq", "files"], ["cq"], ["prompt"]]);
    });

    test("a category turned off hides them", () => {
        expect(filterHelp(entries, "", new Set(["cq"])).shown.map((e) => e.title)).toEqual([
            "yank",
        ]);
        expect(filterHelp(entries, "", new Set(["files"])).shown.map((e) => e.title)).toEqual([
            "close",
            "yank",
        ]);
    });
});
