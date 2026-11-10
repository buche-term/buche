// @vitest-environment happy-dom

// Closing tabs — and what the main tree's last tab ends into. Carreau will not
// close it (an empty layout is the host's business); in buche it closes like
// any other, and the window ends once its contents agreed (see Layout,
// src/layout.ts).

import { panes as panesOf } from "carreau";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PromptCollection } from "../src/components/prompt-collection.tsx";
import { Buche, type InM } from "../src/core.ts";
import type { OutgoingDriverMessage } from "../src/driver-exchange/outgoing.ts";
import { BucheInterface } from "../src/interface.tsx";
import { plainText } from "../src/utils.ts";

afterEach(() => {
    document.body.replaceChildren();
});

// Let the MutationObservers deliver, then the microtasks they schedule run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const TERM = ["$term"];
const SHELL = ["$proc", "cq"];

function setup() {
    const container = document.createElement("div");
    document.body.append(container);
    const iface = new BucheInterface({ container });
    // What closing the window means here: a counter, instead of the real
    // window.close.
    const closeWindow = vi.fn();
    iface.closeWindow = closeWindow;
    const sent: OutgoingDriverMessage[] = [];
    const buche: Buche = new Buche({
        sendDriver: (m) => sent.push(m),
        sendInterface: (m) => iface.processMessage(buche, m),
    });
    // Feed what the interface queued (user actions) to the machine.
    const flush = () => {
        for (const m of iface.interactions.purge()) {
            buche.handle(m as InM);
        }
    };
    const driver = (m: Record<string, unknown>) => buche.handle({ to: TERM, ...m } as InM);
    return { container, iface, buche, closeWindow, sent, flush, driver };
}

function prompt(container: HTMLElement, label = "cq"): HTMLElement {
    for (const pc of container.querySelectorAll<PromptCollection>("prompt-collection")) {
        const entry = pc.prompts.find((e) => plainText(e.cell.label) === label);
        if (entry) {
            return pc.promptElement(entry)!;
        }
    }
    throw new Error(`no prompt ${label}`);
}

// The main tree's tabs, in order.
const tabIds = (iface: BucheInterface): string[] =>
    panesOf(iface.layout.ws.root).flatMap((p) => p.tabs.map((t) => t.id));

// The shell's prompt, then a submitted command answered by a cell of its own
// tab (zone "tab").
function run(
    ctx: ReturnType<typeof setup>,
    cell: Record<string, unknown> = {},
    n = "2",
): { id: string } {
    const { iface, sent, flush, driver, container } = ctx;
    const entry = (prompt(container).closest("prompt-collection") as PromptCollection).prompts[0];
    iface.pushCommand({
        action: { builtin: "submit" },
        entry,
        text: "ls",
        selection: { start: 2, end: 2 },
        event: new KeyboardEvent("keydown"),
    });
    flush();
    const request = sent.at(-1) as OutgoingDriverMessage & { id?: string };
    expect(request.type).toBe("command");
    const id = request.id as string;
    driver({
        type: "configure",
        kind: "terminal",
        from: [...SHELL, n],
        zone: "tab",
        id,
        ...cell,
    });
    return { id };
}

describe("closing the last tab", () => {
    test("it ends the window, once its contents agreed", async () => {
        const ctx = setup();
        ctx.driver({ type: "configure", kind: "prompt", from: SHELL, label: "cq" });
        await settle();
        expect(tabIds(ctx.iface)).toHaveLength(1);

        const closed = ctx.iface.layout.ws.closeTab(tabIds(ctx.iface)[0]);
        ctx.flush(); // the close signal, to the process
        expect(ctx.sent.at(-1)?.type).toBe("signal");
        expect(ctx.closeWindow).not.toHaveBeenCalled(); // asked, not agreed yet

        ctx.driver({ type: "close", from: SHELL, outcome: { type: "success" } });
        await settle();
        expect(await closed).toBe(true);
        expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
    });

    test("a forceful close ends the window right away, killing its contents", async () => {
        const ctx = setup();
        ctx.driver({ type: "configure", kind: "prompt", from: SHELL, label: "cq" });
        await settle();

        expect(ctx.iface.layout.ws.forceClose(tabIds(ctx.iface)[0])).toBe(true);
        expect(ctx.closeWindow).toHaveBeenCalledTimes(1);
        ctx.flush();
        expect(ctx.sent.at(-1)?.type).toBe("signal");
        expect((ctx.sent.at(-1) as { code?: number }).code).toBe(9);
    });

    test("any other tab closes the way carreau does (the window stays)", async () => {
        const ctx = setup();
        ctx.driver({ type: "configure", kind: "prompt", from: SHELL, label: "cq" });
        await settle();
        const promptTab = tabIds(ctx.iface)[0];
        run(ctx);
        await settle();
        expect(tabIds(ctx.iface)).toHaveLength(2);

        // The cell's tab: its process is over by the time it is closed.
        const cellTab = tabIds(ctx.iface).find((id) => id !== promptTab) as string;
        ctx.driver({ type: "close", from: [...SHELL, "2"], outcome: { type: "success" } });
        await settle();
        expect(await ctx.iface.layout.ws.closeTab(cellTab)).toBe(true);
        await settle();
        expect(tabIds(ctx.iface)).toHaveLength(1);
        expect(ctx.closeWindow).not.toHaveBeenCalled();
    });

    test("the tab's ✕ and its menu now reach it too (canCloseTab)", async () => {
        const ctx = setup();
        ctx.driver({ type: "configure", kind: "prompt", from: SHELL, label: "cq" });
        await settle();
        const ws = ctx.iface.layout.ws;
        // Carreau draws the tab's ✕ and enables its close items by this: the
        // last tab has them too. (Carreau's own guard said false only for it.)
        for (const id of tabIds(ctx.iface)) {
            expect(ws.canCloseTab(id)).toBe(true);
        }
    });
});
