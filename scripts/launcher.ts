/**
 * What the launcher (scripts/electron.ts) and the app it starts
 * (electron/main.ts, which takes the same options when packaged) share: the
 * command-line options, and the page the window shows.
 */

/** The launcher's options (see bin/buche.js for what they do). */
export const LAUNCHER_OPTIONS = {
    command: { type: "string", short: "c" },
    dir: { type: "string", short: "d" },
    layout: { type: "string", short: "l" },
    devtools: { type: "boolean" },
    "print-messages": { type: "boolean" },
    update: { type: "boolean" },
    "reset-bindings": { type: "boolean" },
} as const;

/**
 * The page buche runs in (the Electron window's, the browser view's): what
 * goes in its head (the stylesheets), then in its body before the layout's
 * container, and the script that brings it up.
 */
export function pageHtml(parts: { head: string; body?: string; script: string }): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Buche</title>
${parts.head}
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; }
  body {
    /* Very dark grey. */
    background: #141414;
    color: #d0d0d0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  /* The layout (carreau) fills the window. */
  #buche { position: fixed; inset: 0; display: flex; padding: 4px; box-sizing: border-box; }
</style>
</head>
<body>
${parts.body ?? ""}
<div id="buche"></div>
${parts.script}
</body>
</html>
`;
}
