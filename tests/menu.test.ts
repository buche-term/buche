// @vitest-environment happy-dom

// Context menus: carreau's items show their shortcut (from the bindings),
// and buche adds its own (Kill, Run again) on the menu's cell.

import { afterEach, describe, expect, test } from "vitest";
import type { Shortcut } from "../src/bindings.ts";
import type { EchoBox } from "../src/components/echo-box.tsx";
import { renderShortcut } from "../src/components/keys.ts";
import { Buche, type InM } from "../src/core.ts";
import { BucheInterface } from "../src/interface.tsx";
import { isMac } from "../src/keychord.ts";
import "../src/components/echo-box.tsx";
import "../src/components/prompt-collection.tsx";

afterEach(() => {
    document.body.replaceChildren();
});

const SHELL = ["$proc", "cq"];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function machineInterface(status: "running" | "done" = "running") {
    const container = document.createElement("div");
    document.body.append(container);
    const iface = new BucheInterface({ container });
    const buche: Buche = new Buche({
        sendDriver: () => {},
        sendInterface: (m) => iface.processMessage(buche, m),
    });
    const driver = (m: Record<string, unknown>) => buche.handle({ to: ["$term"], ...m } as InM);
    driver({ type: "configure", kind: "prompt", from: SHELL, label: "cq" });
    const from = [...SHELL, "2"];
    driver({ type: "configure", kind: "frame", from, label: "c2" });
    if (status === "done") {
        driver({ type: "close", from, outcome: { type: "success" } });
    }
    const entry = buche.get(from);
    const box = iface.layout.boxOf(entry) as EchoBox;
    return { iface, container, entry, box };
}

/** Right-click an element: the menu that opens. */
function menuOf(container: HTMLElement, target: Element): HTMLElement {
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const menu = container.querySelector<HTMLElement>(".carreau-menu");
    if (!menu) {
        throw new Error("no menu");
    }
    return menu;
}

/** The menu of a cell's pane (its tab bar is folded: one tab). */
const paneMenu = (container: HTMLElement, box: EchoBox) =>
    menuOf(container, box.closest(".carreau-pane") as HTMLElement);

/** The menu of a cell's header (the strip shown instead of its tab bar). */
function headerMenu(container: HTMLElement, box: EchoBox): HTMLElement {
    const strip = box
        .closest(".carreau-pane")
        ?.querySelector(":scope > .carreau-body > .carreau-long");
    if (!strip) {
        throw new Error("no header");
    }
    return menuOf(container, strip);
}

/** The menu of the prompt's tab (the one tab shown). */
function tabMenu(container: HTMLElement): HTMLElement {
    const tab = [...container.querySelectorAll(".carreau-tab")].find(
        (t) => !t.closest("[hidden]"),
    );
    if (!tab) {
        throw new Error("no tab shown");
    }
    return menuOf(container, tab);
}

const label = (b: HTMLElement) =>
    [...b.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("");
const buttonOf = (menu: HTMLElement, text: string) =>
    [...menu.querySelectorAll<HTMLButtonElement>(":scope > button")].find(
        (b) => label(b) === text,
    );
/** The "Send to" submenu of a menu. */
const sendTo = (menu: HTMLElement) =>
    [...menu.querySelectorAll<HTMLElement>(":scope > .carreau-menu-sub")]
        .find((r) => r.querySelector(".carreau-menu-subtitle")?.textContent?.startsWith("Send to"))
        ?.querySelector<HTMLElement>(".carreau-submenu");

/** An item's shortcut, as text (the rendered glyphs say it in their aria-label). */
const kbd = (b: HTMLElement | undefined) =>
    b?.querySelector(".carreau-menu-kbd > .buche-keys")?.getAttribute("aria-label");
const mac = isMac();

describe("context menus", () => {
    test("a tab's menu shows the shortcuts of its items", () => {
        const { container } = machineInterface();
        const menu = tabMenu(container);
        expect(kbd(buttonOf(menu, "Close tab"))).toBe(mac ? "⌥q·w" : "Alt+q·w");
        expect(kbd(buttonOf(menu, "Rename tab…"))).toBeTruthy();
        // (The prompt's tab: no cell items.)
        expect(buttonOf(menu, "Kill")).toBeUndefined();
    });

    test("a cell's pane menu: Close pane, Kill, Run again, Send to", () => {
        const { container, box } = machineInterface();
        const menu = paneMenu(container, box);
        expect(buttonOf(menu, "Close pane")).toBeDefined();
        expect(buttonOf(menu, "Run again")).toBeDefined();
        expect(sendTo(menu)).toBeDefined();
        expect(buttonOf(menu, "Kill")?.disabled).toBe(false);
        expect(kbd(buttonOf(menu, "Kill"))).toBe(mac ? "⌥q·k" : "Alt+q·k");
    });

    test("a cell's header opens its tab's menu, with Kill and Run again", () => {
        const { container, box } = machineInterface();
        const menu = headerMenu(container, box);
        expect(buttonOf(menu, "Close tab")).toBeDefined();
        expect(buttonOf(menu, "Close pane")).toBeUndefined();
        expect(buttonOf(menu, "Kill")).toBeDefined();
        expect(buttonOf(menu, "Run again")).toBeDefined();
        expect(sendTo(menu)).toBeDefined();
    });

    test("Send to: the four sides, then the named panes (not the menu's own)", () => {
        const { iface, container, box } = machineInterface();
        const none = sendTo(headerMenu(container, box));
        expect(none?.querySelectorAll(".carreau-menu-arrow")).toHaveLength(4);
        expect(none?.querySelector(".carreau-menu-note")?.textContent).toBe("No named panes");

        const ws = iface.layout.ws;
        const own = box.closest<HTMLElement>(".carreau-pane")?.dataset.id;
        // (The window's pane, holding the prompt's tab: not the cell's.)
        const other = ws.root;
        expect(other.type === "pane" && other.id !== own).toBe(true);
        ws.namePane(other.id, "notes");
        const sub = sendTo(headerMenu(container, box));
        const names = [...(sub?.querySelectorAll(".carreau-menu-name") ?? [])].map(
            (b) => b.textContent,
        );
        expect(names).toEqual(["notes"]);
        expect(sub?.querySelector(".carreau-menu-note")).toBeNull();
    });

    test("Kill from a cell's header signals that cell", () => {
        const { iface, container, entry, box } = machineInterface();
        iface.interactions.purge();
        buttonOf(headerMenu(container, box), "Kill")?.click();
        const signals = [...iface.interactions.purge()].filter(
            (m: any) => m.type === "user_signal",
        );
        expect(signals).toEqual([{ type: "user_signal", code: 15, entry }]);
    });

    test("Kill is disabled once the process is done", () => {
        const { container, box } = machineInterface("done");
        expect(buttonOf(paneMenu(container, box), "Kill")?.disabled).toBe(true);
    });

    test("Kill signals the menu's cell", () => {
        const { iface, container, entry, box } = machineInterface();
        iface.interactions.purge();
        buttonOf(paneMenu(container, box), "Kill")?.click();
        expect(container.querySelector(".carreau-menu")).toBeNull();
        const signals = [...iface.interactions.purge()].filter(
            (m: any) => m.type === "user_signal",
        );
        expect(signals).toEqual([{ type: "user_signal", code: 15, entry }]);
    });

    test("Run again asks to rerun the menu's cell", () => {
        const { iface, container, entry, box } = machineInterface("done");
        iface.interactions.purge();
        buttonOf(paneMenu(container, box), "Run again")?.click();
        const reruns = [...iface.interactions.purge()].filter((m: any) => m.type === "user_rerun");
        expect(reruns).toEqual([{ type: "user_rerun", entry }]);
    });

    test("Close pane closes the cell, as the key does", async () => {
        const { container, box } = machineInterface("done");
        buttonOf(paneMenu(container, box), "Close pane")?.click();
        expect(container.querySelector(".carreau-menu")).toBeNull();
        await settle();
        expect(box.isConnected).toBe(false);
    });

    test("Rename tab… keeps its field focused", () => {
        const { container } = machineInterface();
        buttonOf(tabMenu(container), "Rename tab…")?.click();
        expect(document.activeElement?.tagName).toBe("INPUT");
    });
});

describe("renderShortcut", () => {
    const nav = { name: "nav", hold: "Alt", side: "either", code: "KeyQ" } as const;
    const shortcut = (keys: string[]) => ({ keys, mode: nav, rule: null }) as unknown as Shortcut;

    test("on a Mac: glyphs for modifiers and named keys, text for the rest", () => {
        const el = renderShortcut(shortcut(["KeyI", "Shift+ArrowLeft"]), true);
        expect(el.getAttribute("aria-label")).toBe("⌥q·i·⇧←");
        expect(
            [...el.querySelectorAll(".buche-key-glyph")].map((g) => g.getAttribute("title")),
        ).toEqual(["option", "shift", "←"]);
        expect(el.querySelector(".buche-keys-sep")?.textContent).toBe("·");
        expect(el.textContent).toBe("q·i·");
    });

    test("elsewhere: text", () => {
        const el = renderShortcut(shortcut(["KeyI", "Enter"]), false);
        expect(el.textContent).toBe("Alt+q·i·Enter");
        expect(el.querySelector(".buche-key-glyph")).toBeNull();
    });
});
