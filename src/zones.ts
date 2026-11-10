/**
 * The reserved zones (see `Target` in types.ts, which documents them for
 * drivers): their short aliases, and how the layout places what goes there.
 * Any other zone names a pane, and a pane can't take a reserved name.
 */

/** A reserved zone. */
export interface Zone {
    /** Its short name. */
    alias?: string;
    /** Into the neighbour pane on that side of the anchor's (made if none). */
    direction?: "left" | "right" | "up" | "down";
    /** A new pane on that side of the anchor's pane. */
    split?: "left" | "right" | "top" | "bottom";
}

const ZONES: Record<string, Zone> = {
    inline: {},
    tab: {},
    pop: {},
    float: { alias: "f" },
    left: { alias: "l", direction: "left" },
    right: { alias: "r", direction: "right" },
    up: { alias: "u", direction: "up" },
    down: { alias: "d", direction: "down" },
    sleft: { alias: "sl", split: "left" },
    sright: { alias: "sr", split: "right" },
    sup: { alias: "su", split: "top" },
    sdown: { alias: "sd", split: "bottom" },
};

const ALIASES = new Map(
    Object.entries(ZONES).flatMap(([name, z]) => (z.alias ? [[z.alias, name]] : [])),
);

/** The zone a name stands for: its alias resolved (any other name as is). */
export function zoneName(name: string): string {
    return ALIASES.get(name) ?? name;
}

/** The reserved zone of that (full) name, if it is one. */
export function reservedZone(name: string): Zone | undefined {
    return Object.hasOwn(ZONES, name) ? ZONES[name] : undefined;
}

/** What a pane can't be named: the reserved zones and their aliases. */
export const RESERVED_ZONE_NAMES: string[] = [...Object.keys(ZONES), ...ALIASES.keys()];
