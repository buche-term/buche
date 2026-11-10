// The keymap (keymap.ts) on rules resolved from configs (config.ts), with a
// stand-in host: what runs, in which mode.

import { afterEach, describe, expect, test } from "vitest";
import { resolveBindings } from "../src/config.ts";
import { Keymap } from "../src/keymap.ts";

let keymap: Keymap | null = null;
afterEach(() => {
    keymap?.detach();
    keymap = null;
    document.body.replaceChildren();
});

function setup(
    bindings: unknown[],
    ctx: { inPrompt?: boolean; inPTY?: boolean; inFrame?: boolean } = {},
) {
    const { rules, errors } = resolveBindings([{ bindings }], false);
    // (Without a mode of their own, the rules get Alt+Q: fine here.)
    expect(errors.filter((e) => !e.includes("no rule enters a mode"))).toEqual([]);
    const ran: string[] = [];
    const navModes: string[] = [];
    keymap = new Keymap(rules, {
        run: (rule) => ran.push(rule.action),
        context: () => ({ inPrompt: false, inPTY: false, inFrame: false, ...ctx }),
        setNavMode: (mode) => navModes.push(mode),
    });
    keymap.attach();
    return { keymap, ran, navModes };
}

function key(
    type: "keydown" | "keyup",
    init: KeyboardEventInit,
    target: EventTarget = document.body,
) {
    const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(ev);
    return ev;
}
const press = (init: KeyboardEventInit, target?: EventTarget) => {
    const ev = key("keydown", init, target);
    key("keyup", init, target);
    return ev;
};
const NAV = { key: "alt+q", action: "setMode", args: { mode: "nav", hold: "alt" } };
const altDown = () => key("keydown", { key: "Alt", code: "AltLeft", altKey: true });
const altUp = () => key("keyup", { key: "Alt", code: "AltLeft" });

describe("keymap", () => {
    test("a chord runs its action, and is swallowed; others pass", () => {
        const { ran } = setup([{ key: "ctrl+p", action: "focusPrompt" }]);
        expect(press({ key: "p", code: "KeyP", ctrlKey: true }).defaultPrevented).toBe(true);
        expect(
            press({ key: "p", code: "KeyP", ctrlKey: true, metaKey: true }).defaultPrevented,
        ).toBe(false);
        expect(ran).toEqual(["focusPrompt"]);
    });

    test("by physical key, or by the key typed", () => {
        const { ran } = setup([
            { key: "alt+,", action: "prevTab" },
            { key: "ctrl+a", action: "nextTab" },
        ]);
        // A Mac's Alt+, types "≤"; an AZERTY keyboard types A on KeyQ.
        press({ key: "≤", code: "Comma", altKey: true });
        press({ key: "a", code: "KeyQ", ctrlKey: true });
        expect(ran).toEqual(["prevTab", "nextTab"]);
    });

    test.each([
        [{ inPrompt: true }, "clearPrompt"],
        [{}, "nextTab"],
    ])("conditions: %o → %s", (ctx, action) => {
        const { ran } = setup(
            [
                { key: "ctrl+l", action: "nextTab" },
                { key: "ctrl+l", action: "clearPrompt", when: "inPrompt" },
            ],
            ctx,
        );
        press({ key: "l", code: "KeyL", ctrlKey: true });
        expect(ran).toEqual([action]);
    });

    test("a mode: entered with its key, on while its modifier is held", () => {
        const { keymap, ran, navModes } = setup([
            NAV,
            { key: "left", action: "focusLeft", when: "mode == nav" },
            { key: "shift+left", action: "expandLeft", when: "mode == nav" },
        ]);
        // Out of the mode: nothing.
        press({ key: "ArrowLeft", code: "ArrowLeft" });
        altDown();
        press({ key: "œ", code: "KeyQ", altKey: true });
        expect(keymap.mode).toBe("nav");
        // The mode's modifier is left out: Alt+Left is Left.
        press({ key: "ArrowLeft", code: "ArrowLeft", altKey: true });
        press({ key: "ArrowLeft", code: "ArrowLeft", altKey: true, shiftKey: true });
        altUp();
        expect(keymap.mode).toBe("");
        expect(ran).toEqual(["focusLeft", "expandLeft"]);
        expect(navModes).toEqual(["held", "off"]);
    });

    test("a mode: its key again does nothing; the modifier, or leaveMode, ends it", () => {
        const { keymap, navModes } = setup([
            NAV,
            { key: "escape", action: "leaveMode", when: "mode == nav" },
        ]);
        altDown();
        press({ key: "œ", code: "KeyQ", altKey: true });
        expect(keymap.mode).toBe("nav");
        // The mode's key again, still holding: nothing; the key is swallowed.
        const again = press({ key: "œ", code: "KeyQ", altKey: true });
        expect(keymap.mode).toBe("nav");
        expect(again.defaultPrevented).toBe(true);
        // Releasing the modifier ends it.
        altUp();
        expect(keymap.mode).toBe("");
        // leaveMode ends it while the modifier is still held.
        altDown();
        press({ key: "œ", code: "KeyQ", altKey: true });
        press({ key: "Escape", code: "Escape", altKey: true });
        expect(keymap.mode).toBe("");
        altUp();
        expect(navModes).toEqual(["held", "off", "held", "off"]);
    });

    test("a mode: releasing the modifier ends it, however the key repeat went", () => {
        const { keymap, navModes } = setup([NAV]);
        altDown();
        press({ key: "œ", code: "KeyQ", altKey: true });
        for (let i = 0; i < 3; i++) {
            press({ key: "œ", code: "KeyQ", altKey: true, repeat: true });
        }
        expect(keymap.mode).toBe("nav");
        altUp();
        expect(keymap.mode).toBe("");
        expect(navModes).toEqual(["held", "off"]);
    });

    test("a mode: its modifier on one side", () => {
        const { keymap } = setup([{ ...NAV, args: { mode: "nav", hold: "altleft" } }]);
        key("keydown", { key: "Alt", code: "AltRight", altKey: true });
        press({ key: "œ", code: "KeyQ", altKey: true });
        expect(keymap.mode).toBe("");
        key("keyup", { key: "Alt", code: "AltRight" });
        altDown();
        press({ key: "œ", code: "KeyQ", altKey: true });
        expect(keymap.mode).toBe("nav");
        // (Releasing the other side's Alt doesn't end it.)
        key("keyup", { key: "Alt", code: "AltRight" });
        expect(keymap.mode).toBe("nav");
        altUp();
        expect(keymap.mode).toBe("");
    });

    test("in a mode, a text field's keys are its own", () => {
        const { ran } = setup([NAV, { key: "n", action: "renameTab", when: "mode == nav" }]);
        const input = document.createElement("input");
        document.body.append(input);
        altDown();
        press({ key: "œ", code: "KeyQ", altKey: true });
        expect(press({ key: "n", code: "KeyN" }, input).defaultPrevented).toBe(false);
        press({ key: "n", code: "KeyN" });
        expect(ran).toEqual(["renameTab"]);
    });

    test("sequences: one-shot, or for as long as the prefix key is held", () => {
        const { ran } = setup([
            NAV,
            { key: "s left", action: "swapLeft", when: "mode == nav" },
            { key: "s right", action: "swapRight", when: "mode == nav" },
            { key: "x", action: "mark", when: "mode == nav" },
        ]);
        altDown();
        press({ key: "œ", code: "KeyQ", altKey: true });
        // (The mode lasts while Alt is held: the sequence runs inside it.)
        // S, then ←: once.
        press({ key: "s", code: "KeyS" });
        press({ key: "ArrowLeft", code: "ArrowLeft" });
        press({ key: "ArrowLeft", code: "ArrowLeft" });
        // S held: ← → ←.
        key("keydown", { key: "s", code: "KeyS" });
        press({ key: "ArrowLeft", code: "ArrowLeft" });
        press({ key: "ArrowRight", code: "ArrowRight" });
        key("keyup", { key: "s", code: "KeyS" });
        press({ key: "ArrowLeft", code: "ArrowLeft" });
        // Another key cancels the sequence, and is swallowed.
        press({ key: "s", code: "KeyS" });
        press({ key: "x", code: "KeyX" });
        press({ key: "x", code: "KeyX" });
        altUp();
        expect(ran).toEqual(["swapLeft", "swapLeft", "swapRight", "mark"]);
    });

    test("sequences: the prefix's modifiers may still be held", () => {
        const { ran } = setup([
            NAV,
            { key: "shift+a left", action: "moveLeft", when: "mode == nav" },
        ]);
        altDown();
        press({ key: "œ", code: "KeyQ", altKey: true });
        key("keydown", { key: "A", code: "KeyA", altKey: true, shiftKey: true });
        key("keyup", { key: "A", code: "KeyA", altKey: true, shiftKey: true });
        press({ key: "ArrowLeft", code: "ArrowLeft", altKey: true, shiftKey: true });
        expect(ran).toEqual(["moveLeft"]);
    });

    test("keys are seen even when the DOM focus is outside the interface", () => {
        const { ran } = setup([{ key: "ctrl+p", action: "focusPrompt" }]);
        press({ key: "p", code: "KeyP", ctrlKey: true }, window);
        expect(ran).toEqual(["focusPrompt"]);
    });
});
