/**
 * Wiring a page's interface to the core, for the hosts that run both in the
 * page (the Electron renderer, the browser view): the core's driver messages
 * go out over the host's transport, what comes in over it is handled, and so
 * are the interface's own interactions.
 */
import { Buche, type InM } from "./core.ts";
import type { BucheInterface } from "./interface.tsx";

/** How driver messages travel between the page and the host's drivers. */
export interface Transport {
    /** Send a message to the drivers. */
    send(message: unknown): void;
    /** Hand every message from the drivers to `handler`. */
    onMessage(handler: (message: InM) => void): void;
}

/** A core for `iface`, talking to the drivers over `transport`. */
export function connect(iface: BucheInterface, transport: Transport): Buche {
    const buche = new Buche({
        sendDriver(message) {
            console.debug("[buche] driverOut", message);
            transport.send(message);
        },
        sendInterface(message) {
            iface.processMessage(buche, message);
        },
    });
    transport.onMessage((message) => {
        console.debug("[buche] driverIn", message);
        buche.handle(message);
    });
    void (async () => {
        for await (const interaction of iface.interactions) {
            buche.handle(interaction as InM);
        }
    })();
    return buche;
}
