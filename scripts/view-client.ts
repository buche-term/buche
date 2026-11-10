/**
 * Browser bundle for `scripts/view.ts`.
 *
 * The Buche core and the interface run entirely client-side here:
 *
 *   - A `BucheInterface` lays out the page's #buche container (carreau), from
 *     the initial layout the page gives (see src/page.ts).
 *   - The core is connected to it (src/host.ts) over the WebSocket: outgoing
 *     driver messages are serialised onto it (the server relays them to the
 *     process), and driver messages arriving over it (the process's output)
 *     are handled, as are the interface's own interactions.
 */
import "../src/components/echo-box.tsx";

import { BucheGui } from "../src/components/buche-gui.tsx";
import type { InM } from "../src/core.ts";
import { connect } from "../src/host.ts";
import { BucheInterface } from "../src/interface.tsx";
import { pageSetup } from "../src/page.ts";

// GUI frames load lib:// libraries from the server (see scripts/view.ts).
BucheGui.libBase = `${location.origin}/lib/`;

const iface = new BucheInterface(pageSetup());
// For inspection from the devtools (and browser scripts).
(window as unknown as { bucheView: unknown }).bucheView = { iface };

const socket = new WebSocket(`ws://${location.host}/ws`);

// Outgoing driver messages are buffered until the socket is open, then flushed
// in order — the server relays each one to the process.
const outbound: string[] = [];
function sendToServer(message: unknown): void {
    const json = JSON.stringify(message);
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(json);
    } else {
        outbound.push(json);
    }
}

socket.addEventListener("open", () => {
    console.log("[buche] connected");
    for (const json of outbound.splice(0)) {
        socket.send(json);
    }
});
socket.addEventListener("close", () => console.log("[buche] disconnected"));

// Driver messages from the server (the process's output) drive the core.
connect(iface, {
    send: sendToServer,
    onMessage(handler) {
        socket.addEventListener("message", (event) => handler(JSON.parse(event.data) as InM));
    },
});
