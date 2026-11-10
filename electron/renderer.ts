/**
 * Renderer bundle for the Electron app (electron/main.ts).
 *
 * The Electron counterpart of scripts/view-client.ts: the Buche core and the
 * interface run here, and the driver process lives in the main process. The
 * preload (electron/preload.ts) carries messages both ways — incoming ones
 * arrive as window messages, outgoing ones go through `window.buche.driver`.
 */
import "../src/components/echo-box.tsx";

import { listenQuitHint } from "../src/components/quit-hint.ts";
import type { InM } from "../src/core.ts";
import { connect } from "../src/host.ts";
import { BucheInterface } from "../src/interface.tsx";
import { pageSetup } from "../src/page.ts";

interface DriverBridge {
    driver?: { send(message: unknown): void };
}
const bridge = (window as unknown as { buche?: DriverBridge }).buche;
if (!bridge?.driver) {
    throw new Error("electron: the driver bridge is missing (preload not loaded?)");
}

const iface = new BucheInterface(pageSetup());
listenQuitHint();

// Driver messages from the main process (the shell's output) come in as
// window messages.
connect(iface, {
    send: (message) => bridge.driver?.send(message),
    onMessage(handler) {
        window.addEventListener("message", (event) => {
            const data = event.data as { __buche?: string; message?: InM } | null;
            if (data?.__buche === "driver:message" && data.message) {
                handler(data.message);
            }
        });
    },
});
