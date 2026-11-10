import type { Buche } from "../core.ts";
import type { BaseMessage } from "./common.ts";

/** An action's arguments: scalars, as the interface's action registry
 *  takes them. */
export type ActionArgs = Record<string, string | number | boolean>;

/** An action, named the way the interface's key bindings and menus name
 *  it (see its action registry, src/actions.ts). */
export interface ActionSpec {
    /** The action's id. */
    id: string;

    /** Its arguments (none where it takes none). */
    args?: ActionArgs;
}

/**
 * Run an interface action, asked by the process that shows at `from`: one
 * of the actions the user's keys and menus run — close a tab, clear a
 * prompt's stream, rename the window. The cell the asking process shows is
 * what the action applies to: its prompt element for a prompt, its box for
 * a cell, in place of what the keyboard focus would have been. An unknown
 * id does nothing. E.g. a shell's `clear` builtin, so it can clear the
 * finished cells of its prompt's stream without producing a cell of its
 * own.
 */
export interface BucheActionMessage extends BaseMessage {
    type: "buche_action";

    /** The action to run. */
    action: ActionSpec;
}

export function handle$buche_action(buche: Buche, obj: BucheActionMessage): void {
    const entry = buche.hierarchy.getAt(obj.from, false);
    // (Nothing shows at that address, or it is gone: the action has nothing
    // to apply to.)
    if (!entry) {
        return;
    }
    buche.sendInterface({ type: "run_action", entry, action: obj.action });
}
