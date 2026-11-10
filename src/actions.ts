// The actions that key bindings (config.ts) and context menus run: carreau's
// layout actions, wrapped (after one, the selected cell takes the focus), and
// buche's own. An action is referred to by its id and its arguments (an
// `ActionRef`); old names ("insertLeft", "focusUp"...) are aliases. This is
// the only registry buche consults.
//
// (No DOM at import time: the interface is only a type here.)

import {
    type ActionRef,
    ActionRegistry,
    type Args,
    type CarreauActionContext,
    carreauActions,
    refKey,
} from "carreau/actions";
import { isSpent } from "./cell.ts";
import type { BucheInterface } from "./interface.tsx";

export interface BucheActionContext {
    iface: BucheInterface;
    /** The key event, when a key ran it. */
    event?: KeyboardEvent;
    /** A context menu's pane and tab (see carreau's CarreauActionContext). */
    node?: string;
    tab?: string;
}

export const actions = new ActionRegistry<BucheActionContext>();
export { type ActionRef, type Args, refKey };

/** Carreau's context, from buche's. */
const carreauContext = (ctx: BucheActionContext): CarreauActionContext => ({
    ws: ctx.iface.layout.ws,
    view: ctx.iface.layout.view,
    node: ctx.node,
    tab: ctx.tab,
});

// Carreau's, run by it (see BucheInterface.runLayoutAction).
for (const def of carreauActions.list()) {
    const { enabled, visible, label } = def;
    actions.define({
        id: def.id,
        title: def.title,
        description: def.description,
        categories: def.categories,
        params: def.params,
        check: def.check,
        run: (ctx, args) => ctx.iface.runLayoutAction({ id: def.id, args }, ctx),
        ...(enabled && { enabled: (ctx, args) => enabled(carreauContext(ctx), args) }),
        ...(visible && { visible: (ctx, args) => visible(carreauContext(ctx), args) }),
        ...(label && { label: (ctx, args) => label(carreauContext(ctx), args) }),
    });
}
for (const [name, ref] of Object.entries(carreauActions.aliases())) {
    actions.alias(name, ref);
}

// Buche's own.

/** A context menu's tab (a pane's menu: its active tab), if any. */
function menuTab(ctx: BucheActionContext): string | undefined {
    return (
        ctx.tab ??
        (ctx.node !== undefined ? (ctx.iface.activeTabOf(ctx.node) ?? undefined) : undefined)
    );
}

/** A context menu's cell (not a prompt): its entry; null if none, undefined out of a menu. */
function menuCell(ctx: BucheActionContext) {
    if (ctx.node === undefined && ctx.tab === undefined) {
        return undefined;
    }
    const tab = menuTab(ctx);
    const entry = tab ? ctx.iface.layout.entryOf(tab) : null;
    return entry && entry.cell.kind !== "prompt" ? entry : null;
}

actions.define({
    id: "setMode",
    title: "Enter a mode",
    description: "Enter a mode, which lasts while its modifier is held",
    categories: ["modes"],
    params: { mode: {}, hold: {} },
    // (The keymap's.)
    run: () => {},
});

actions.define({
    id: "leaveMode",
    title: "Leave the mode",
    description: "Leave the current mode",
    categories: ["modes"],
    // (The keymap's.)
    run: () => {},
});

actions.define({
    id: "focusPrompt",
    title: "Focus the prompt",
    description: "Focus the closest visible prompt, or the last one used",
    categories: ["focus"],
    run: (ctx) => ctx.iface.focusPrompt(),
});

actions.define({
    id: "clearPrompt",
    title: "Clear the prompt's finished cells",
    description: "Remove the finished cells from this prompt's stream",
    categories: ["prompt"],
    run(ctx) {
        // Only that prompt's own stream: other tabs keep their spent cells.
        const target = ctx.event?.target;
        if (target instanceof Element && target.closest('[focusable="prompt"]')) {
            ctx.iface.clearStream(target);
        }
    },
});

actions.define({
    id: "kill",
    title: "Kill",
    description:
        "End the cell's process (forcefully if it does not answer), without closing the cell",
    categories: ["cells"],
    run: (ctx) => ctx.iface.killCell(menuTab(ctx)),
    // In a menu: a cell's, while its process lives.
    visible: (ctx) => menuCell(ctx) !== null,
    enabled(ctx) {
        const entry = menuCell(ctx);
        return !entry || !isSpent(entry.cell.status.status);
    },
});

actions.define({
    id: "rerun",
    title: "Run again",
    description: "Run the cell's process again, from the start, in the same cell",
    categories: ["cells"],
    run: (ctx) => ctx.iface.rerunCell(menuTab(ctx)),
    visible: (ctx) => menuCell(ctx) !== null,
});

actions.define({
    id: "renameWindow",
    title: "Rename the window…",
    description: "Change the window's title",
    categories: ["windows"],
    run: (ctx) => ctx.iface.renameWindow(),
});

// A new tab, offering what goes in it (see Layout.insert).
const insert = carreauActions.get("insert");
if (!insert) {
    throw new Error("carreau defines no insert action");
}
actions.define(
    {
        id: "insert",
        title: insert.title,
        description: insert.description,
        categories: insert.categories,
        params: insert.params,
        check: insert.check,
        run(ctx, args) {
            // From a menu: carreau's own (what the menu did before).
            if (ctx.node !== undefined) {
                ctx.iface.runLayoutAction({ id: "insert", args }, ctx);
                return;
            }
            const { target, into } = args;
            if (target === "float") {
                ctx.iface.layout.insertFloat();
            } else if (target === "tab") {
                ctx.iface.layout.insert();
            } else {
                // Into the pane on that side, or (into: false) a new pane there.
                ctx.iface.layout.insert(target as "left" | "right" | "up" | "down", !into);
            }
        },
    },
    { override: true },
);

// Tabs: through BucheInterface.cycleTabs (the same as carreau's, then the
// focus follows into the new tab).
for (const id of ["nextTab", "prevTab"]) {
    const def = carreauActions.get(id);
    if (!def) {
        throw new Error(`carreau defines no ${id} action`);
    }
    actions.define(
        {
            id,
            title: def.title,
            description: def.description,
            categories: def.categories,
            run: (ctx) => ctx.iface.cycleTabs(id === "nextTab"),
        },
        { override: true },
    );
}
