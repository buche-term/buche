// @vitest-environment node

import { describe, expect, test } from "vitest";
import {
    bindingChord,
    CHORD_TABLES,
    chordLabel,
    chordParts,
    eventChords,
    eventChordsWith,
} from "../src/chords.ts";

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

describe("eventChords", () => {
    // (A key event's fields, as eventChords reads them.)
    const event = (init: Partial<KeyboardEvent>) => ({
        code: "",
        key: "",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        ...init,
    });
    const chords = (init: Partial<KeyboardEvent>) => eventChords(event(init));

    test("by the physical key, then by the key typed", () => {
        expect(chords({ key: "l", code: "KeyL", ctrlKey: true })).toEqual(["Ctrl+KeyL"]);
        expect(chords({ key: "Enter", code: "Enter" })).toEqual(["Enter"]);
        // (Another layout: AZERTY's A is QWERTY's Q.)
        expect(chords({ key: "a", code: "KeyQ", ctrlKey: true })).toEqual([
            "Ctrl+KeyQ",
            "Ctrl+KeyA",
        ]);
    });

    test("an Alt chord a Mac types as a special character, or a dead key: by its key", () => {
        expect(chords({ key: "å", code: "KeyA", altKey: true })).toEqual(["Alt+KeyA"]);
        expect(chords({ key: "≤", code: "Comma", altKey: true })).toEqual(["Alt+Comma"]);
        expect(chords({ key: "Dead", code: "KeyE", altKey: true })[0]).toBe("Alt+KeyE");
    });

    test("a shifted character is Shift and its key, on any layout", () => {
        expect(chords({ key: "<", code: "Comma", shiftKey: true })).toEqual(["Shift+Comma"]);
        // (A German keyboard's < key, without Shift.)
        expect(chords({ key: "<", code: "IntlBackslash" })).toEqual([
            "IntlBackslash",
            "Shift+Comma",
        ]);
    });

    test("self-contained: its source, alone, matches the same (GUI iframes run it)", () => {
        const copy = new Function(`return (${eventChordsWith.toString()})`)()(
            JSON.parse(JSON.stringify(CHORD_TABLES)),
        );
        for (const init of [
            { key: "l", code: "KeyL", ctrlKey: true },
            { key: "å", code: "KeyA", altKey: true },
            { key: "?", code: "Slash", shiftKey: true },
            { key: "ArrowLeft", code: "ArrowLeft", metaKey: true },
            { key: " ", code: "Space" },
        ]) {
            expect(copy(event(init))).toEqual(eventChords(event(init)));
        }
    });
});

describe("bindingChord (a prompt's keys)", () => {
    test.each([
        ["ctrl+t", "Ctrl+KeyT"],
        ["Ctrl+L", "Ctrl+KeyL"],
        ["Enter", "Enter"],
        ["Alt+a", "Alt+KeyA"],
        // Shifted punctuation: as typed, or unshifted.
        ["shift+<", "Shift+Comma"],
        ["<", "Shift+Comma"],
        ["shift+,", "Shift+Comma"],
        // The virtual keys.
        ["Previous", "Previous"],
        ["next", "Next"],
        ["é", null],
    ])("%s → %s", (key, chord) => {
        expect(bindingChord(key, false)).toBe(chord);
    });
    test("mod: Cmd on a Mac, else Ctrl", () => {
        expect(bindingChord("mod+k", true)).toBe("Meta+KeyK");
        expect(bindingChord("mod+k", false)).toBe("Ctrl+KeyK");
    });
});
