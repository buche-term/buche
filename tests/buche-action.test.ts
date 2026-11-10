// @vitest-environment happy-dom

// The driver's `buche_action`: a process running one of the interface's
// actions — the same registry the user's keys and menus run — on the cell
// it shows. A shell's `clear` builtin, clearing its prompt's stream, is the
// motivating case (see src/driver-exchange/_buche_action.ts).

import { afterEach, describe, expect, test } from "vitest";
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
    return { container, iface, buche, sent, flush, driver };
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

// The shell's prompt, then a submitted command answered by a cell of the
// prompt's own stream.
function run(ctx: ReturnType<typeof setup>, n = "2"): { id: string; box: () => Element | null } {
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
    driver({ type: "configure", kind: "terminal", from: [...SHELL, n], zone: null, id });
    return { id, box: () => container.querySelector(`#echo-${id}`) };
}

describe("the driver's buche_action", () => {
    test("a prompt's process can clear its stream (the `clear` builtin)", async () => {
        const ctx = setup();
        ctx.driver({ type: "configure", kind: "prompt", from: SHELL, label: "cq" });
        await settle();
        const { box } = run(ctx);
        await settle();
        expect(box()).not.toBeNull();
        // A finished cell: clearable, but it stays until the stream is.
        ctx.driver({ type: "close", from: [...SHELL, "2"], outcome: { type: "success" } });
        await settle();
        expect(box()).not.toBeNull();

        ctx.driver({ type: "buche_action", from: SHELL, action: { id: "clearPrompt" } });
        await settle();
        expect(box()).toBeNull();
        // The prompt itself goes nowhere.
        expect(prompt(ctx.container)).not.toBeNull();
    });

    test("an unknown id does nothing", async () => {
        const ctx = setup();
        ctx.driver({ type: "configure", kind: "prompt", from: SHELL, label: "cq" });
        await settle();
        const { box } = run(ctx);
        await settle();
        ctx.driver({ type: "close", from: [...SHELL, "2"], outcome: { type: "success" } });
        await settle();

        ctx.driver({ type: "buche_action", from: SHELL, action: { id: "no_such_action" } });
        await settle();
        expect(box()).not.toBeNull();
    });

    test("an address showing nothing runs nothing", async () => {
        const ctx = setup();
        // Nothing at that address: no prompt even. The message is dropped
        // (the container keeps just the empty layout's chooser).
        ctx.driver({ type: "buche_action", from: SHELL, action: { id: "clearPrompt" } });
        await settle();
        expect(ctx.container.querySelector("prompt-collection")).toBeNull();
        expect(ctx.container.querySelector("echo-box")).toBeNull();
    });
});
