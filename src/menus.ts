// Buche's context menus: which actions, in what order (see carreau's
// menus.ts for the item kinds). Each action decides whether it shows, its
// label, and whether it is enabled, from the menu's pane and tab (see
// actions.ts): e.g. Kill shows only on a cell, enabled while its process
// lives. A shortcut bound to an action shows beside it (see bindings.ts).

import { arrowRow, type MenuSpec, namedPanes } from "carreau";

/** A pane's menu: right click on its chrome, or its ⋯ button. */
export const PANE_MENU: MenuSpec = [
    {
        submenu: "New",
        items: [
            arrowRow("insert"),
            { action: "insert", args: { target: "tab" }, label: "Tab" },
            { action: "insert", args: { target: "float" }, label: "Float" },
        ],
    },
    { submenu: "Send to", items: [arrowRow("sendTo"), namedPanes("sendTo")] },
    { action: "float" },
    { action: "group" },
    { action: "collapse" },
    { action: "toggleStick" },
    { action: "removePaneName" },
    { action: "kill" },
    { action: "rerun" },
    { action: "namePane" },
    { action: "closePane" },
    { action: "help" },
];

/** A tab's menu: right click on a tab, or on a cell's header (the strip
 *  shown instead of a tab bar). */
export const TAB_MENU: MenuSpec = [
    { action: "insert", args: { target: "tab" }, label: "New tab" },
    { action: "float" },
    { action: "kill" },
    { action: "rerun" },
    { submenu: "Send to", items: [arrowRow("sendTo"), namedPanes("sendTo")] },
    { action: "collapse" },
    { action: "renameTab" },
    { action: "closeTab" },
    { action: "help" },
];
