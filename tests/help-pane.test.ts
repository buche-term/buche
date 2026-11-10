// @vitest-environment happy-dom

// The help popup: opened with Alt+Q ? (or a menu's Help), searchable, with
// categories to toggle; Esc closes it.

import { afterEach, describe, expect, test } from "vitest";
import { helpShown, hideHelp } from "../src/components/help-pane.ts";
import { Buche, type InM } from "../src/core.ts";
import { BucheInterface } from "../src/interface.tsx";
import "../src/components/echo-box.tsx";
import "../src/components/prompt-collection.tsx";

afterEach(() => {
    hideHelp();
    document.body.replaceChildren();
});

function key(
    target: EventTarget,
    type: "keydown" | "keyup",
    init: KeyboardEventInit,
): KeyboardEvent {
    const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(ev);
    return ev;
}

function setup() {
    const container = document.createElement("div");
    document.body.append(container);
    const iface = new BucheInterface({ container });
    return { iface, container };
}

/** Alt+Q, then ? (Shift+/), Alt held throughout; then Alt released. */
function altQHelp(container: HTMLElement): void {
    key(container, "keydown", { key: "Alt", code: "AltLeft", altKey: true });
    key(container, "keydown", { key: "q", code: "KeyQ", altKey: true });
    key(container, "keydown", { key: "?", code: "Slash", altKey: true, shiftKey: true });
    key(container, "keyup", { key: "Alt", code: "AltLeft" });
}

const box = () => document.querySelector<HTMLElement>(".buche-help")!;
const search = () => document.querySelector<HTMLInputElement>(".buche-help-search")!;
const rows = () => [...document.querySelectorAll(".buche-help-name")].map((n) => n.textContent);
const chips = () =>
    [...document.querySelectorAll<HTMLElement>(".buche-help-chip")].map((c) => ({
        name: c.firstChild?.textContent,
        on: c.classList.contains("on"),
    }));

describe("the help", () => {
    test("Alt+Q ? opens it, out of the mode, with the focus", () => {
        const { iface, container } = setup();
        altQHelp(container);
        expect(helpShown()).toBe(true);
        expect(iface.keys.mode).toBe("");
        expect(document.activeElement).toBe(box());
        expect(rows()).toEqual(expect.arrayContaining(["Nav mode", "Close tab", "Help"]));
        // "advanced" is off at first.
        expect(chips().find((c) => c.name === "advanced")?.on).toBe(false);
        expect(rows()).not.toContain("Close tab now");
        iface.keys.detach();
    });

    test("typing searches", () => {
        const { iface, container } = setup();
        altQHelp(container);
        key(box(), "keydown", { key: "c" });
        expect(document.activeElement).toBe(search());
        search().value = "close tab";
        search().dispatchEvent(new Event("input"));
        expect(rows()).toEqual(["Close tab"]);
        expect(document.querySelector(".buche-help-empty")?.textContent).toBe(
            "+1 match in the categories turned off",
        );
        expect(document.querySelector(".buche-help-name mark")?.textContent?.toLowerCase()).toBe(
            "close",
        );
        iface.keys.detach();
    });

    test("categories: a number toggles the nth, ← → and space the current one", () => {
        const { iface, container } = setup();
        altQHelp(container);
        expect(chips()[0]).toEqual({ name: "modes", on: true });
        key(box(), "keydown", { key: "1" });
        expect(chips()[0].on).toBe(false);
        expect(rows()).not.toContain("Nav mode");
        key(box(), "keydown", { key: " " });
        expect(chips()[0].on).toBe(true);
        key(box(), "keydown", { key: "ArrowLeft" });
        key(box(), "keydown", { key: " " });
        expect(chips().at(-1)).toEqual({ name: "advanced", on: true });
        expect(rows()).toContain("Close tab now");
        // (Back as it was, for the other tests: the categories are kept between openings.)
        key(box(), "keydown", { key: " " });
        iface.keys.detach();
    });

    test("a click on an entry expands it, with its categories; another click, back", () => {
        const { iface, container } = setup();
        altQHelp(container);
        const row = () =>
            [...document.querySelectorAll<HTMLElement>(".buche-help-item")].find(
                (r) => r.querySelector(".buche-help-name")?.textContent === "Float",
            )!;
        const categories = () =>
            [...row().querySelectorAll(".buche-help-category")].map((c) => c.textContent);
        expect(row().classList.contains("expanded")).toBe(false);
        row().click();
        expect(row().classList.contains("expanded")).toBe(true);
        expect(categories()).toEqual(["layout", "windows"]);
        // (Still expanded as the list changes.)
        search().value = "float";
        search().dispatchEvent(new Event("input"));
        expect(row().classList.contains("expanded")).toBe(true);
        row().click();
        expect(row().classList.contains("expanded")).toBe(false);
        iface.keys.detach();
    });

    test("Esc clears the search, then closes", () => {
        const { iface, container } = setup();
        altQHelp(container);
        search().value = "tab";
        search().dispatchEvent(new Event("input"));
        key(search(), "keydown", { key: "Escape" });
        expect(search().value).toBe("");
        expect(helpShown()).toBe(true);
        key(search(), "keydown", { key: "Escape" });
        expect(helpShown()).toBe(false);
        expect(document.querySelector(".buche-help-overlay")).toBeNull();
        iface.keys.detach();
    });

    test("Alt+Q ? again closes it", () => {
        const { iface, container } = setup();
        altQHelp(container);
        altQHelp(container);
        expect(helpShown()).toBe(false);
        iface.keys.detach();
    });

    test("a pane's menu has Help, with its shortcut", () => {
        const { iface, container } = setup();
        const pane = container.querySelector(".carreau-pane");
        expect(pane).not.toBeNull();
        pane?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        const help = [
            ...container.querySelectorAll<HTMLButtonElement>(".carreau-menu > button"),
        ].find((b) => b.firstChild?.textContent === "Help");
        expect(help?.querySelector(".buche-keys")?.getAttribute("aria-label")).toMatch(
            /q·(⇧|Shift\+)\/$/,
        );
        help?.click();
        expect(helpShown()).toBe(true);
        iface.keys.detach();
    });
});

describe("the help, about prompts' bindings", () => {
    const SHELL = ["$proc", "cq"];
    const bindings = {
        "ctrl+t": { command: "@pop sel fzf", title: "Pick a file" },
        "ctrl+b": { command: "@pop sel bed", inherit: true },
    };

    function machine() {
        const { iface } = setup();
        const buche: Buche = new Buche({
            sendDriver: () => {},
            sendInterface: (m) => iface.processMessage(buche, m),
        });
        const driver = (m: Record<string, unknown>) =>
            buche.handle({ to: ["$term"], ...m } as InM);
        driver({ type: "configure", kind: "prompt", from: SHELL, label: "cq", bindings });
        const from = [...SHELL, "2"];
        driver({ type: "configure", kind: "frame", from, label: "c2" });
        const box = iface.layout.boxOf(buche.get(from))!;
        const prompt = iface.layout.promptElement(buche.get(SHELL))!;
        return { iface, box, prompt };
    }
    const where = () =>
        [...document.querySelectorAll(".buche-help-item")]
            .filter((r) => r.querySelector(".buche-help-where"))
            .map((r) => [
                r.querySelector(".buche-help-name")?.textContent,
                r.querySelector(".buche-help-where")?.textContent,
            ]);

    test("from a prompt: its bindings, first after the modes", () => {
        const { iface, prompt } = machine();
        iface.focus.focus(prompt);
        iface.toggleHelp();
        expect(where()).toEqual(
            expect.arrayContaining([
                ["Pick a file", "in the prompt"],
                ["@pop sel bed", "in the prompt and its cells"],
            ]),
        );
        // (After the "modes" category's: the mode, and leaving it.)
        expect(rows().slice(0, 4)).toEqual([
            "Nav mode",
            "Leave the mode",
            "Pick a file",
            "@pop sel bed",
        ]);
        iface.keys.detach();
    });

    test("from a cell: only the inherited ones", () => {
        const { iface, box } = machine();
        iface.focus.focus(box);
        iface.toggleHelp();
        expect(rows()).not.toContain("Pick a file");
        expect(where()).toEqual(expect.arrayContaining([["@pop sel bed", "from cq"]]));
        iface.keys.detach();
    });
});
