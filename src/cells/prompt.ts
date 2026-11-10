import { Cell } from "../cell.ts";
import { bindingChord, isMac } from "../chords.ts";
import type { Action, Submission, SubmissionConfiguration } from "../types.ts";
import { applySubmission } from "../utils.ts";

export type PromptBindings = Record<string, Action>;

export interface PromptConfiguration {
    /** Key chord → action (see Action) for this prompt. */
    bindings?: PromptBindings;

    /**
     * The prompt's input: its content (what the user is typing, with the
     * `selection`, the ghost-text `filigrane` and its `editability`) and its
     * context (the marker text above the editor). Not to be confused with the
     * cell's `submission` (CellConfiguration), what a cell shows was submitted.
     */
    input?: SubmissionConfiguration;

    /**
     * If true, the prompt takes the focus (its tab shown, if hidden), as
     * this configuration is applied: e.g. for a command that just changed the
     * prompt's content, to hand it back to the user. Not kept: each
     * configuration with it focuses the prompt once. (It overrides
     * `background` for a new prompt.)
     *
     * For a new cell, or a new process (the cell standing in for what it
     * shows): it takes the focus as it appears, as a command's echo does (see
     * CommandRequest's `id`): e.g. for a command submitted by another one,
     * which buche didn't send. Only when the entry is created (and, as for a
     * prompt, it overrides `background`).
     */
    focus?: boolean;
}

/** A prompt: an editor the user types commands at. It takes no commands: it
 *  is configured (see `configurePrompt`). */
export class PromptCell extends Cell {
    readonly kind = "prompt";

    /** Key chord → action (see Action), as the driver wrote them. */
    get bindings(): PromptBindings {
        return this.written;
    }
    set bindings(bindings: PromptBindings) {
        this.written = bindings;
        // In the canonical form once (see chords.ts), to match key events' chords.
        this.byChord = new Map();
        for (const [key, action] of Object.entries(bindings)) {
            const chord = bindingChord(key, isMac());
            if (!chord) {
                console.warn(`buche: a prompt binding's key is not a key: "${key}"`);
            } else if (!this.byChord.has(chord)) {
                this.byChord.set(chord, { key, action });
            }
        }
    }
    private written: PromptBindings = {};
    private byChord = new Map<string, { key: string; action: Action }>();

    /**
     * The binding of the first of these chords (canonical: see eventChords)
     * it binds, if any. `inherited`: only those that work in the cells under
     * the prompt (see Action's `inherit`).
     */
    bound(chords: string[], inherited = false): { key: string; action: Action } | null {
        for (const chord of chords) {
            const found = this.byChord.get(chord);
            if (
                found &&
                (!inherited || (typeof found.action === "object" && found.action.inherit))
            ) {
                return found;
            }
        }
        return null;
    }

    /** What the user is typing, and the marker above it. */
    input: Submission = {
        content: { parts: [], selection: { start: 0, end: 0 } },
        context: { parts: [] },
    };

    /**
     * Machine bookkeeping (not configuration): the `request_id` of the last
     * parse sent for its content. A highlight echo (a configure with a
     * `request_id`) only applies while it matches. Null once an authoritative
     * configure took over (no parse is awaiting its answer).
     */
    request_id: string | null = null;

    /** Apply a prompt's configuration (its bindings and input). */
    configurePrompt(config: PromptConfiguration): void {
        this.bindings = config.bindings ?? this.bindings;
        applySubmission(this.input, config.input);
    }
}
