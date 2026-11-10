// The help: a popup listing the keyboard shortcuts (see help.ts for what it
// lists), searchable, with a toggle per category ("advanced" off at first).
// Its keys, after aesthetic's help panel: type to search; ← → to pick a
// category, Space or Enter to toggle it, 1-9 to toggle the nth; / to search;
// ↑ ↓ to scroll; Esc clears the search, else closes (as does ?, or a click
// outside).
//
// Appearance: help-pane.css (in components.css).

import { shortcutLabel } from "../bindings.ts";
import { filterHelp, type HelpEntry, helpCategories } from "../help.ts";
import { renderShortcut } from "./keys.ts";

export interface HelpOptions {
    /** Whether to draw macOS glyphs. */
    mac: boolean;
    /** Whether an entry's action can run now (dimmed if not). */
    enabled?: (entry: HelpEntry) => boolean;
    /** Run when the help closes, however it closed (to give the focus back). */
    done?: () => void;
}

interface Help {
    overlay: HTMLElement;
    box: HTMLElement;
    search: HTMLInputElement;
    chips: HTMLElement;
    list: HTMLElement;
    entries: HelpEntry[];
    options: HelpOptions;
    cursor: number;
    /** What had the focus last in the popup (given back, see refocusHelp). */
    focused: HTMLElement;
    /** The entries shown whole (clicked), while the help is open. */
    expanded: Set<HelpEntry>;
}

let help: Help | null = null;
/** The categories turned off (kept from one opening to the next). */
const hidden = new Set(["advanced"]);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) =>
    Object.assign(
        document.createElement(tag),
        { className },
        text === undefined ? {} : { textContent: text },
    );

/** Whether the help is open. */
export const helpShown = (): boolean => help !== null;

/** Close the help, if open. */
export function hideHelp(): void {
    const h = help;
    if (!h) {
        return;
    }
    help = null;
    h.overlay.remove();
    h.options.done?.();
}

/** Open the help (one already open is replaced), and return its element. */
export function showHelp(entries: HelpEntry[], options: HelpOptions): HTMLElement {
    hideHelp();
    const overlay = el("div", "buche-help-overlay");
    const box = el("div", "buche-help");
    box.tabIndex = 0;
    const search = el("input", "buche-help-search");
    Object.assign(search, { placeholder: "search", spellcheck: false, autocomplete: "off" });
    const chips = el("span", "buche-help-chips");
    const head = el("div", "buche-help-head");
    head.append(
        el("span", "buche-help-title", "Keyboard shortcuts"),
        search,
        chips,
        el("span", "buche-help-hint", "type to search · ← → space: categories · esc: close"),
    );
    const list = el("div", "buche-help-list");
    box.append(head, list);
    overlay.append(box);
    const h: Help = {
        overlay,
        box,
        search,
        chips,
        list,
        entries,
        options,
        cursor: 0,
        focused: box,
        expanded: new Set(),
    };
    help = h;

    const categories = () => helpCategories(entries);
    const move = (d: number) => {
        const n = categories().length;
        if (n) {
            h.cursor = (h.cursor + d + n) % n;
        }
        render(h);
    };
    const toggle = (i: number) => {
        const c = categories()[i];
        if (c === undefined) {
            return;
        }
        h.cursor = i;
        if (hidden.has(c)) {
            hidden.delete(c);
        } else {
            hidden.add(c);
        }
        render(h);
    };
    const scroll = (by: number) => list.scrollBy({ top: by });

    box.addEventListener("keydown", (e) => {
        // (Modal for the keys: nothing else in the page gets them.)
        e.stopPropagation();
        if (e.target === search || e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }
        const k = e.key;
        if (k === "ArrowLeft" || k === "ArrowRight") {
            move(k === "ArrowLeft" ? -1 : 1);
        } else if (k === " " || k === "Enter") {
            toggle(h.cursor);
        } else if (/^[1-9]$/.test(k)) {
            toggle(Number(k) - 1);
        } else if (k === "/") {
            search.focus();
        } else if (k === "Escape") {
            if (search.value) {
                search.value = "";
                render(h);
            } else {
                hideHelp();
            }
        } else if (k === "?") {
            hideHelp();
        } else if (k === "ArrowUp" || k === "ArrowDown") {
            scroll(k === "ArrowUp" ? -40 : 40);
        } else if (k === "PageUp" || k === "PageDown") {
            scroll((k === "PageUp" ? -0.9 : 0.9) * list.clientHeight);
        } else if (k.length === 1) {
            // Any other character starts a search.
            search.focus();
            search.value += k;
            render(h);
        } else {
            return;
        }
        e.preventDefault();
    });
    search.addEventListener("input", () => render(h));
    search.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (search.value) {
                search.value = "";
                render(h);
            } else {
                hideHelp();
            }
        } else if (e.key === "Enter" || e.key === "ArrowDown") {
            box.focus();
        } else {
            return;
        }
        e.preventDefault();
    });
    chips.addEventListener("click", (e) => {
        const chip = (e.target as Element).closest<HTMLElement>(".buche-help-chip");
        if (chip) {
            toggle(Number(chip.dataset.i));
        }
    });
    box.addEventListener("focusin", (e) => {
        h.focused = e.target as HTMLElement;
    });
    overlay.addEventListener("pointerdown", (e) => {
        if (e.target === overlay) {
            hideHelp();
        }
    });

    document.body.append(overlay);
    render(h);
    box.focus();
    return overlay;
}

/** Give the help back the DOM focus, if it is open. Leaving a mode commits
 *  the focus to the selected cell, which takes it from the popup. */
export function refocusHelp(): void {
    const h = help;
    if (h) {
        requestAnimationFrame(() => h.focused.focus());
    }
}

/** The help's chips and rows, for its search and categories. */
function render(h: Help): void {
    const { entries, search, chips, list, options } = h;
    const categories = helpCategories(entries);
    const { found, shown } = filterHelp(entries, search.value, hidden);
    const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    chips.replaceChildren(
        ...categories.map((c, i) => {
            const chip = el(
                "span",
                `buche-help-chip${hidden.has(c) ? "" : " on"}${i === h.cursor ? " cur" : ""}`,
                c,
            );
            chip.dataset.i = String(i);
            if (i < 9) {
                chip.title = `toggle: ${i + 1}`;
            }
            chip.append(
                el(
                    "span",
                    "buche-help-n",
                    String(found.filter((e) => e.categories.includes(c)).length),
                ),
            );
            return chip;
        }),
    );
    list.replaceChildren(
        ...shown.map((e) => {
            const dim = e.shadowedBy || (options.enabled && !options.enabled(e));
            const row = el(
                "div",
                `buche-help-item${dim ? " dim" : ""}${h.expanded.has(e) ? " expanded" : ""}`,
            );
            // A click shows it whole (its text uncut, its categories), or cut again. (Not
            // the end of a text selection.)
            row.addEventListener("click", () => {
                if (document.getSelection()?.toString()) {
                    return;
                }
                if (!h.expanded.delete(e)) {
                    h.expanded.add(e);
                }
                row.classList.toggle("expanded", h.expanded.has(e));
            });
            const keys = el("span", "buche-help-keys");
            for (const s of e.shortcuts) {
                const k = el("span", "buche-help-key");
                k.append(renderShortcut(s.shortcut, options.mac));
                if (s.where) {
                    k.append(el("span", "buche-help-where", s.where));
                }
                k.title =
                    shortcutLabel(s.shortcut, options.mac) + (s.where ? ` (${s.where})` : "");
                keys.append(k);
            }
            const text = el("span", "buche-help-text");
            // (A prompt's command, shown as is, can be long: cut, whole in the tooltip, or
            // once expanded.)
            const title = el("span", "buche-help-name");
            title.title = e.title;
            title.append(...highlight(e.title, terms));
            text.append(title);
            if (e.description) {
                const desc = el("span", "buche-help-desc");
                desc.title = e.description;
                desc.append(...highlight(e.description, terms));
                text.append(desc);
            }
            if (e.shadowedBy) {
                text.append(
                    el(
                        "span",
                        "buche-help-desc",
                        `Its key does something else here: ${e.shadowedBy}`,
                    ),
                );
            }
            // (Shown once expanded.)
            const categories = el("span", "buche-help-categories");
            categories.append(...e.categories.map((c) => el("span", "buche-help-category", c)));
            text.append(categories);
            row.append(keys, text);
            return row;
        }),
    );
    const elsewhere = found.length - shown.length;
    if (!shown.length) {
        list.append(
            el(
                "div",
                "buche-help-empty",
                terms.length ? "No matching shortcuts" : "No shortcuts in the selected categories",
            ),
        );
    }
    if (elsewhere) {
        list.append(
            el(
                "div",
                "buche-help-empty",
                `+${elsewhere} ${elsewhere === 1 ? "match" : "matches"} in the categories turned off`,
            ),
        );
    }
}

/** Text, with the search's words marked. */
function highlight(text: string, terms: string[]): (string | HTMLElement)[] {
    if (!terms.length) {
        return [text];
    }
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return text
        .split(new RegExp(`(${escaped.join("|")})`, "gi"))
        .map((part, i) => (i % 2 ? el("mark", "", part) : part));
}
