// Main-process glue for the `proc://` GUI resource protocol, the Electron
// counterpart of the runtime shim in <buche-gui> (see
// src/components/buche-gui-runtime.ts). This is the "native" version of the original
// ~/code/buche `src/terminal/file-protocol.js`, without the `buche://`
// hash/nonce library scheme.
//
// Wiring (in the Electron main process):
//
//   import { app, BrowserWindow } from "electron";
//   import { guiRuntimeDocument } from "../src/components/buche-gui-runtime.ts";
//   import { initProcProtocol, registerProcScheme, setRuntimeHtml, setWebContents } from "./proc-protocol.ts";
//
//   registerProcScheme(); // before app is ready
//   setRuntimeHtml(guiRuntimeDocument());
//   const win = await app.whenReady().then(() => new BrowserWindow({
//       webPreferences: { preload: path.join(__dirname, "preload.cjs") },
//   }));
//   initProcProtocol();
//   addWebContents(win.webContents);
//
// Requests the renderer's preload answers from its cache never leave main;
// cache misses are relayed to the windows (`proc:request`) and awaited — each
// window's interface routes them to its own owning process and only that one
// answers (see `installGuiRelay` in src/interface.tsx), through the preload
// (`proc:response`). More than one window is tracked (Cmd+N): the request goes
// to all of them, and the first answer is taken.

import { ipcMain, protocol, type WebContents } from "electron";
import { guiCsp } from "../src/csp.ts";
import type { LibraryRegistry } from "../src/library.ts";

interface CachedResource {
    content: string;
    mimetype: string;
    encoding?: string | null;
}

// proc://<cell-id>/<path> resources pushed ahead of time.
const procCache = new Map<string, Map<string, CachedResource>>();
// In-flight requests relayed to the renderer.
const pendingProcRequests = new Map<
    string,
    { resolve: (v: ProcAnswer) => void; reject: (e: Error) => void }
>();

interface ProcAnswer {
    status?: number;
    content?: string;
    mimetype?: string;
    encoding?: string | null;
}

let runtimeHtml = "<!doctype html><html><body></body></html>";

// No network (see src/csp.ts), on every proc: and lib: response, not just the
// runtime document: a document or worker loaded from either scheme gets the
// policy of its own response, not its loader's.
const CSP = { "content-security-policy": guiCsp() };
const pages = new Set<WebContents>();

/** The runtime document served at `proc://<cell-id>/` (the `html`-less GUI
 *  shell; see guiRuntimeDocument). */
export function setRuntimeHtml(html: string): void {
    runtimeHtml = html;
}

/** Track a window's page: cache misses are relayed to every live one, and the
 *  page holding the cell answers (only that one finds it). */
export function addWebContents(wc: WebContents): void {
    pages.add(wc);
}

export function removeWebContents(wc: WebContents): void {
    pages.delete(wc);
}

/** Must run before the app is ready (registers `lib:` too, since the
 *  privileged schemes are registered in one go). */
export function registerProcScheme(): void {
    const privileges = {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
    };
    protocol.registerSchemesAsPrivileged([
        { scheme: "proc", privileges },
        { scheme: "lib", privileges },
    ]);
}

/**
 * Serve `lib://<id>/<path>` from the library registry (see src/library.ts).
 * Each library is an origin of its own, loaded from the cells' `proc://`
 * origins: hence the CORS header, which module scripts and `fetch` need.
 */
export function initLibProtocol(libraries: LibraryRegistry): void {
    protocol.handle("lib", async (request) => {
        const url = new URL(request.url);
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("method not allowed", { status: 405 });
        }
        const answer = await libraries.serve(url.hostname, url.pathname);
        return new Response(request.method === "HEAD" ? null : (answer.body as BodyInit), {
            status: answer.status,
            headers: {
                "content-type": answer.mimetype,
                "access-control-allow-origin": "*",
                ...CSP,
                // A library's files never change under its id.
                ...(answer.status === 200 && { "cache-control": "max-age=31536000, immutable" }),
            },
        });
    });
}

const bodyOf = (r: { content?: string; encoding?: string | null }): BodyInit =>
    r.encoding === "base64" ? Buffer.from(r.content ?? "", "base64") : (r.content ?? "");

export function initProcProtocol(): void {
    ipcMain.on(
        "proc:cache",
        (
            _event,
            {
                cellId,
                path,
                content,
                mimetype,
                encoding,
            }: CachedResource & { cellId: string; path: string },
        ) => {
            let cell = procCache.get(cellId);
            if (!cell) {
                cell = new Map();
                procCache.set(cellId, cell);
            }
            cell.set(path, { content, mimetype, encoding });
        },
    );

    ipcMain.on("proc:response", (_event, answer: ProcAnswer & { requestId: string }) => {
        const pending = pendingProcRequests.get(answer.requestId);
        if (pending) {
            pendingProcRequests.delete(answer.requestId);
            pending.resolve(answer);
        }
    });

    protocol.handle("proc", async (request) => {
        const url = new URL(request.url);
        const cellId = url.hostname;
        const resourcePath = url.pathname || "/";

        // The runtime document itself.
        if (resourcePath === "/" || resourcePath === "/index.html") {
            return new Response(runtimeHtml, {
                headers: { "content-type": "text/html; charset=utf-8", ...CSP },
            });
        }

        const cached = procCache.get(cellId)?.get(resourcePath);
        if (cached) {
            return new Response(bodyOf(cached), {
                headers: { "content-type": cached.mimetype, ...CSP },
            });
        }

        const live = [...pages].filter((c) => !c.isDestroyed());
        if (live.length === 0) {
            return new Response("Not available", { status: 503 });
        }

        const requestId = Math.random().toString(36).slice(2);
        const answered = new Promise<ProcAnswer>((resolve, reject) => {
            const timer = setTimeout(() => {
                pendingProcRequests.delete(requestId);
                reject(new Error("proc:// request timeout"));
            }, 10_000);
            pendingProcRequests.set(requestId, {
                resolve: (v) => {
                    clearTimeout(timer);
                    resolve(v);
                },
                reject: (e) => {
                    clearTimeout(timer);
                    reject(e);
                },
            });
        });

        const relay = {
            requestId,
            cellId,
            path: resourcePath,
            method: request.method,
            params: Object.fromEntries(url.searchParams),
        };
        // Every window is asked; only the one whose page holds the cell answers
        // (see installGuiRelay, src/interface.tsx).
        for (const contents of live) {
            contents.send("proc:request", relay);
        }

        try {
            const answer = await answered;
            return new Response(bodyOf(answer), {
                status: answer.status ?? 200,
                headers: { "content-type": answer.mimetype ?? "application/octet-stream", ...CSP },
            });
        } catch {
            return new Response("Failed to resolve resource", { status: 502 });
        }
    });
}
