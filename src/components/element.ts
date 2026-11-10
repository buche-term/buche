/**
 * What buche's custom elements share: content built once, on first need;
 * typed listeners for their own events; registration.
 */

/** A custom element whose content is built once, when it is first needed:
 *  connected, or used before (each method that needs it calls
 *  `ensureSetup`). */
export abstract class LazyElement extends HTMLElement {
    /** Whether `setup` has run. */
    protected initialized = false;

    /** Build the element's content (run once). */
    protected abstract setup(): void;

    protected ensureSetup(): void {
        if (!this.initialized) {
            this.initialized = true;
            this.setup();
        }
    }
}

/**
 * A {@link LazyElement} with typed listeners for its own events (`M`: event
 * name to event type), falling back to the standard signature:
 *
 *   class EchoBox extends WithEvents<EchoBoxEventMap>() { ... }
 */
export function WithEvents<M>() {
    abstract class Evented extends LazyElement {
        addEventListener<K extends keyof M>(
            type: K,
            listener: (this: this, ev: M[K]) => void,
            options?: boolean | AddEventListenerOptions,
        ): void;
        addEventListener(
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions,
        ): void;
        addEventListener(type: string, listener: unknown, options?: unknown): void {
            super.addEventListener(
                type,
                listener as EventListenerOrEventListenerObject,
                options as boolean | AddEventListenerOptions,
            );
        }

        removeEventListener<K extends keyof M>(
            type: K,
            listener: (this: this, ev: M[K]) => void,
            options?: boolean | EventListenerOptions,
        ): void;
        removeEventListener(
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | EventListenerOptions,
        ): void;
        removeEventListener(type: string, listener: unknown, options?: unknown): void {
            super.removeEventListener(
                type,
                listener as EventListenerOrEventListenerObject,
                options as boolean | EventListenerOptions,
            );
        }
    }
    return Evented;
}

/** Register a custom element, once (and not where there is no DOM). */
export function defineElement(tag: string, cls: CustomElementConstructor): void {
    if (typeof customElements !== "undefined" && !customElements.get(tag)) {
        customElements.define(tag, cls);
    }
}
