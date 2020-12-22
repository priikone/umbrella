import type { IObjectOf } from "@thi.ng/api";
import { isBoolean } from "@thi.ng/checks";
import { clamp } from "@thi.ng/math";
import { fromDOMEvent, merge, Stream } from "@thi.ng/rstream";
import { map } from "@thi.ng/transducers";
import type {
    GestureEvent,
    GestureInfo,
    GestureStream,
    GestureStreamOpts,
    GestureType,
    UIEvent,
    UIEventID,
} from "./api";

const startEvents = new Set([
    "mousedown",
    "touchmove",
    "touchstart",
    "mousemove",
]);

const endEvents = new Set(["mouseup", "touchend", "touchcancel"]);

const baseEvents = <const>["mousemove", "mousedown", "touchstart", "wheel"];

const eventGestureTypeMap: IObjectOf<GestureType> = {
    touchstart: "start",
    touchmove: "drag",
    touchend: "end",
    touchcancel: "end",
    mousedown: "start",
    mouseup: "end",
    wheel: "zoom",
};

/**
 * Attaches mouse & touch event listeners to given DOM element and
 * returns a stream of {@link GestureEvent}s and their
 * {@link GestureInfo} details.
 *
 * In multi-touch environments, a `GestureEvent` can contain multiple
 * such `GestureInfo` objects (one per active touch). In general, the
 * `click` and `delta` values are only present if the abstracted event
 * `type == "drag"`. Both (and `pos` too) are 2-element arrays
 * of `[x,y]` coordinates.
 *
 * The `zoom` value is always present, but is only updated with wheel
 * events. The value will be constrained to `minZoom` ... `maxZoom`
 * interval (provided via options object).
 *
 * Note: If using `preventDefault` and attaching the event stream to
 * `document.body`, the following event listener options SHOULD be used:
 *
 * @example
 * ```ts
 * eventOpts: { passive: false }
 * ```
 *
 * {@link https://www.chromestatus.com/features/5093566007214080 }
 *
 * @param el -
 * @param opts -
 */
export const gestureStream = (
    el: Element,
    _opts?: Partial<GestureStreamOpts>
): GestureStream => {
    const opts = <GestureStreamOpts>{
        id: "gestures",
        zoom: 1,
        absZoom: true,
        minZoom: 0.25,
        maxZoom: 4,
        smooth: 1,
        eventOpts: { capture: true },
        preventDefault: true,
        preventScrollOnZoom: true,
        preventContextMenu: true,
        local: true,
        scale: false,
        ..._opts,
    };
    const active: GestureInfo[] = [];
    let zoom = clamp(opts.zoom, opts.minZoom, opts.maxZoom);
    let zoomDelta = 0;
    let numTouches = 0;
    let tempStreams: Stream<UIEvent>[] | undefined;

    const isBody = el === document.body;
    const tempEvents: UIEventID[] = [
        "touchend",
        "touchcancel",
        "touchmove",
        "mouseup",
    ];
    !isBody && tempEvents.push("mousemove");

    opts.preventContextMenu &&
        el.addEventListener("contextmenu", (e) => e.preventDefault());

    const stream = merge<UIEvent, GestureEvent>({
        src: baseEvents.map((id) => eventSource(el, id, opts)),
        xform: map((e) => {
            opts.preventDefault && e.preventDefault();
            const etype = e.type;
            const type =
                etype === "mousemove"
                    ? tempStreams
                        ? "drag"
                        : "move"
                    : eventGestureTypeMap[etype];
            let isTouch = !!(<TouchEvent>e).touches;
            let events: Array<Touch | MouseEvent | WheelEvent> = isTouch
                ? Array.from((<TouchEvent>e).changedTouches)
                : [<MouseEvent | WheelEvent>e];
            const b = el.getBoundingClientRect();

            const getPos = (e: Touch | MouseEvent | WheelEvent) => {
                let x = e.clientX;
                let y = e.clientY;
                if (opts.local) {
                    x -= b.left;
                    y -= b.top;
                }
                if (opts.scale) {
                    const dpr = window.devicePixelRatio || 1;
                    x *= dpr;
                    y *= dpr;
                }
                return [x | 0, y | 0];
            };

            if (startEvents.has(etype)) {
                const isStart = etype === "mousedown" || etype === "touchstart";
                for (let t of events) {
                    const id = (<Touch>t).identifier || 0;
                    const pos = getPos(t);
                    let touch = active.find((t) => t.id === id);
                    if (!touch && isStart) {
                        touch = <GestureInfo>{ id, start: pos };
                        active.push(touch);
                        numTouches++;
                    }
                    if (touch) {
                        touch.pos = pos;
                        touch.delta = [
                            pos[0] - touch.start![0],
                            pos[1] - touch.start![1],
                        ];
                        if (isTouch) {
                            touch.force = (<Touch>t).force;
                        }
                    }
                }
                if (isStart && !tempStreams) {
                    tempStreams = tempEvents.map((id) =>
                        eventSource(document.body, id, opts, "-temp")
                    );
                    stream.addAll(tempStreams);
                    !isBody && stream.removeID("mousemove");
                }
            } else if (endEvents.has(etype)) {
                for (let t of events) {
                    const id = (<Touch>t).identifier || 0;
                    const idx = active.findIndex((t) => t.id === id);
                    if (idx !== -1) {
                        active.splice(idx, 1);
                        numTouches--;
                    }
                }
                if (numTouches === 0) {
                    stream.removeAll(tempStreams!);
                    !isBody && stream.add(eventSource(el, "mousemove", opts));
                    tempStreams = undefined;
                }
            } else if (type === "zoom") {
                const zdelta =
                    opts.smooth *
                    ("wheelDeltaY" in (e as any)
                        ? -(e as any).wheelDeltaY / 120
                        : (<WheelEvent>e).deltaY / 40);
                zoom = opts.absZoom
                    ? clamp(zoom + zdelta, opts.minZoom, opts.maxZoom)
                    : zdelta;
                zoomDelta = zdelta;
            }
            return {
                event: e,
                pos: getPos(events[0]),
                buttons: isTouch ? active.length : (<MouseEvent>e).buttons,
                type,
                active,
                zoom,
                zoomDelta,
                isTouch,
            };
        }),
    });

    return stream;
};

const eventSource = (
    el: Element,
    type: UIEventID,
    opts: GestureStreamOpts,
    suffix = ""
) => {
    let eventOpts = opts.eventOpts;
    if (type === "wheel" && opts.preventScrollOnZoom) {
        eventOpts = isBoolean(eventOpts)
            ? { capture: eventOpts, passive: false }
            : { ...eventOpts, passive: false };
    }
    return fromDOMEvent(el, type, eventOpts, { id: type + suffix });
};
