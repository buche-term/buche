// @vitest-environment node

import { describe, expect, test } from "vitest";
import { actions, refKey } from "../src/actions.ts";
import { resolveBindings } from "../src/config.ts";
import { defaultConfig } from "./default-config.ts";

const NAV = { key: "alt+q", action: "setMode", args: { mode: "nav", hold: "alt" } };
const resolve = (bindings: unknown[]) =>
    resolveBindings([{ bindings: [NAV, ...bindings] }], false);

describe("actions", () => {
    test("every action in the defaults resolves", () => {
        const names = (defaultConfig.bindings as { action: string }[]).map((b) => b.action);
        expect(names.length).toBeGreaterThan(10);
        for (const name of names.filter((n) => n !== "setMode")) {
            expect(() => actions.resolve(name), name).not.toThrow();
        }
        const { errors } = resolveBindings([defaultConfig], false);
        expect(errors).toEqual([]);
    });

    test("a rule keeps its name as written, and holds the resolved reference", () => {
        const { rules, errors } = resolve([
            { key: "i left", action: "insertIntoLeft", when: "mode == nav" },
        ]);
        expect(errors).toEqual([]);
        const rule = rules[1];
        expect(rule.action).toBe("insertIntoLeft");
        expect(refKey(rule.ref)).toBe("insert?into=true&target=left");
    });

    test("an id with arguments is the same reference as the old name", () => {
        const { rules, errors } = resolve([
            {
                key: "i left",
                action: "insert",
                args: { target: "left", into: true },
                when: "mode == nav",
            },
        ]);
        expect(errors).toEqual([]);
        expect(rules[1].action).toBe("insert");
        expect(refKey(rules[1].ref)).toBe("insert?into=true&target=left");
    });

    test("wrong arguments are reported", () => {
        const { rules, errors } = resolve([
            { key: "i left", action: "insert", args: { target: "sideways" }, when: "mode == nav" },
            { key: "ctrl+alt+f", action: "focus" },
            { key: "ctrl+alt+k", action: "kill", args: { now: true } },
        ]);
        expect(rules).toHaveLength(1);
        expect(errors).toEqual([
            expect.stringContaining(
                "insert: target: expected one of tab, left, right, up, down, float",
            ),
            expect.stringContaining('focus: missing argument "target"'),
            expect.stringContaining('kill: unknown argument "now"'),
        ]);
    });

    test("unknown action", () => {
        expect(resolve([{ key: "ctrl+alt+x", action: "nope" }]).errors).toEqual([
            expect.stringContaining('unknown action "nope"'),
        ]);
    });

    test("removal: by an old directional name, only the matching rules; by id, all", () => {
        const both = [
            { key: "i shift+left", action: "insertLeft", when: "mode == nav" },
            { key: "i shift+right", action: "insertRight", when: "mode == nav" },
            {
                key: "i left",
                action: "insert",
                args: { target: "left", into: true },
                when: "mode == nav",
            },
        ];
        const one = resolve([...both, { action: "-insertLeft" }]);
        expect(one.errors).toEqual([]);
        expect(one.rules.slice(1).map((r) => refKey(r.ref))).toEqual([
            "insert?into=false&target=right",
            "insert?into=true&target=left",
        ]);
        const args = resolve([
            ...both,
            { action: "-insert", args: { target: "left", into: true } },
        ]);
        expect(args.rules.slice(1).map((r) => r.action)).toEqual(["insertLeft", "insertRight"]);
        const all = resolve([...both, { action: "-insert" }]);
        expect(all.errors).toEqual([]);
        expect(all.rules.slice(1)).toEqual([]);
        // An action that requires arguments, removed by its id.
        const focus = resolve([
            { key: "left", action: "focusLeft", when: "mode == nav" },
            { key: "right", action: "focus", args: { target: "right" }, when: "mode == nav" },
            { action: "-focus" },
        ]);
        expect(focus.errors).toEqual([]);
        expect(focus.rules.slice(1)).toEqual([]);
    });
});
