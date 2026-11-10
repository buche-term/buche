// @vitest-environment node

import { describe, expect, test } from "vitest";
import { chordLabel, chordParts } from "../src/chords.ts";

describe("chordLabel", () => {
    test.each([
        ["Alt+KeyQ", true, "⌥Q"],
        ["Alt+KeyQ", false, "Alt+Q"],
        ["Shift+Ctrl+ArrowLeft", true, "⌃⇧←"],
        ["Shift+Ctrl+ArrowLeft", false, "Ctrl+Shift+←"],
        ["Comma", false, ","],
        ["Shift+BracketRight", false, "Shift+]"],
        ["Escape", true, "Esc"],
        ["Meta+KeyP", true, "⌘P"],
        ["Meta+KeyP", false, "Meta+P"],
        ["Backspace", true, "⌫"],
        ["Backspace", false, "Backspace"],
        ["Delete", false, "Del"],
        ["PageDown", false, "PgDn"],
        ["F5", false, "F5"],
        ["Digit7", false, "7"],
        ["Ctrl+Tab", false, "Ctrl+Tab"],
        ["Insert", false, "Insert"],
    ])("%s (mac: %s) → %s", (chord, mac, label) => {
        expect(chordLabel(chord, mac)).toBe(label);
    });
});

describe("chordParts", () => {
    test("modifiers and key", () => {
        expect(chordParts("Shift+Alt+ArrowUp")).toEqual({
            key: "up",
            ctrl: false,
            alt: true,
            shift: true,
            meta: false,
            anyShift: false,
        });
    });
    test("key names", () => {
        expect(
            ["KeyQ", "Digit7", "Comma", "Escape", "Enter", "PageUp", "F5", "Numpad1"].map(
                (c) => chordParts(c).key,
            ),
        ).toEqual(["q", "7", ",", "esc", "enter", "pageup", "f5", "numpad1"]);
    });
});
