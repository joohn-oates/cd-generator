import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

// Carousel for CD embeds.
// Slides move with a transform (no native scrollbar). Browse with the arrows,
// the dots, clicking or swiping a side slide, a sideways trackpad swipe, or the
// arrow keys. The centre slide stays interactive, so dragging it spins the CD.

const BASE_W = 774 // the embed is laid out at this size, then scaled to fit
const BASE_H = 660
const EASE = "cubic-bezier(.22,.8,.24,1)"

interface Detail {
    title?: string
    link?: string
}

interface Props {
    embeds?: React.ReactNode[]
    details?: Detail[]
    loop?: boolean
    gap?: number
    sideScale?: number
    sideOpacity?: number
    titleColor?: string
    controlColor?: string
    style?: React.CSSProperties
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export default function EmbedCarousel({
    embeds = [],
    details = [],
    loop = true,
    gap = 24,
    sideScale = 0.88,
    sideOpacity = 0.45,
    titleColor = "#ffffff",
    controlColor = "#ffffff",
    style,
}: Props) {
    const slides = embeds.map((embed, i) => ({ embed, ...details[i] }))
    const n = slides.length

    const [index, setIndex] = React.useState(0)
    const current = Math.min(index, Math.max(0, n - 1))
    const go = (i: number) =>
        n && setIndex(loop ? (i + n) % n : clamp(i, 0, n - 1))
    const canPrev = n > 1 && (loop || current > 0)
    const canNext = n > 1 && (loop || current < n - 1)

    const viewport = React.useRef<HTMLDivElement>(null)
    const width = useWidth(viewport)
    const card = clamp(width - 96, 1, BASE_W)
    const height = (BASE_H * card) / BASE_W

    const atEdge = (dx: number) =>
        !loop && ((current === 0 && dx > 0) || (current === n - 1 && dx < 0))
    const swipe = useSwipe({
        enabled: n > 1,
        threshold: Math.min(120, card * 0.18),
        resist: atEdge,
        onSwipe: (dir) => go(current + dir),
        onTap: (slide) => slide !== current && go(slide),
    })
    useTrackpadSwipe(viewport, (dir) => go(current + dir))

    const offset = width / 2 - card / 2 - current * (card + gap) + swipe.dx
    const slide = slides[current]

    return (
        <div
            className="ec"
            style={{ ...style, "--c": controlColor } as React.CSSProperties}
            aria-roledescription="carousel"
            aria-label="CD gallery"
        >
            <style>{CSS}</style>

            <div
                ref={viewport}
                className={"ec-viewport" + (swipe.dragging ? " dragging" : "")}
                style={{ height: height + 48 }}
                tabIndex={0}
                aria-label="Use the left and right arrow keys to browse"
                onKeyDown={(e) => {
                    const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
                    if (dir) {
                        e.preventDefault()
                        go(current + dir)
                    }
                }}
                {...swipe.handlers}
            >
                <div
                    className="ec-track"
                    style={{
                        gap,
                        transform: `translate3d(${offset}px,0,0)`,
                        transition: swipe.dragging ? "none" : undefined,
                    }}
                >
                    {slides.map((s, i) => {
                        const active = i === current
                        return (
                            <div
                                key={i}
                                data-slide={i}
                                className={"ec-slide" + (active ? " active" : "")}
                                style={{
                                    width: card,
                                    height,
                                    transform: `scale(${active ? 1 : sideScale})`,
                                    opacity: active ? 1 : sideOpacity,
                                }}
                                role="group"
                                aria-roledescription="slide"
                                aria-label={label(i, n, s.title)}
                                aria-hidden={!active}
                            >
                                <div
                                    className="ec-embed"
                                    style={{ transform: `scale(${card / BASE_W})` }}
                                >
                                    {sized(s.embed)}
                                </div>
                                {/* A side slide's embed would swallow clicks, so a cover catches them. */}
                                {!active && <div className="ec-cover" />}
                            </div>
                        )
                    })}
                </div>

                {n === 0 && (
                    <div className="ec-empty">
                        Add an Embed to “CDs” in the properties panel
                    </div>
                )}
            </div>

            {slide?.title && (
                <div
                    key={current}
                    className="ec-title"
                    style={{ color: titleColor }}
                    aria-live="polite"
                >
                    {slide.link ? (
                        <a href={slide.link} target="_blank" rel="noopener noreferrer">
                            {slide.title}
                        </a>
                    ) : (
                        slide.title
                    )}
                </div>
            )}

            {n > 1 && (
                <div className="ec-controls">
                    <button
                        className="ec-arrow"
                        aria-label="Previous CD"
                        disabled={!canPrev}
                        onClick={() => go(current - 1)}
                    >
                        <Chevron path="M10 3 5 8l5 5" />
                    </button>
                    <div className="ec-dots" role="tablist" aria-label="Choose a CD">
                        {slides.map((s, i) => (
                            <button
                                key={i}
                                role="tab"
                                aria-selected={i === current}
                                aria-label={"Go to " + label(i, n, s.title)}
                                onClick={() => go(i)}
                            />
                        ))}
                    </div>
                    <button
                        className="ec-arrow"
                        aria-label="Next CD"
                        disabled={!canNext}
                        onClick={() => go(current + 1)}
                    >
                        <Chevron path="M6 3l5 5-5 5" />
                    </button>
                </div>
            )}
        </div>
    )
}

// ---------- helpers ----------

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const label = (i: number, n: number, title?: string) =>
    `${i + 1} of ${n}` + (title ? ": " + title : "")

// Framer embeds need an explicit size; lay each one out at the base size.
const sized = (node: React.ReactNode) =>
    React.Children.map(node, (c) =>
        React.isValidElement(c)
            ? React.cloneElement(c as React.ReactElement<any>, {
                  style: { ...(c.props as any).style, width: BASE_W, height: BASE_H },
              })
            : c
    )

const Chevron = ({ path }: { path: string }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
            d={path}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

// Tracks an element's width.
function useWidth(ref: React.RefObject<HTMLElement>, initial = 1200) {
    const [width, setWidth] = React.useState(initial)
    React.useEffect(() => {
        const el = ref.current
        if (!el) return
        const ro = new ResizeObserver(() => setWidth(el.clientWidth))
        ro.observe(el)
        return () => ro.disconnect()
    }, [ref])
    return width
}

// Horizontal drag/swipe. A small movement counts as a tap on whichever slide
// was pressed; a mostly-vertical movement is left to page scrolling.
function useSwipe(opts: {
    enabled: boolean
    threshold: number
    resist: (dx: number) => boolean
    onSwipe: (dir: 1 | -1) => void
    onTap: (slide: number) => void
}) {
    const [dx, setDx] = React.useState(0)
    const [dragging, setDragging] = React.useState(false)
    const start = React.useRef<{ x: number; y: number; id: number; slide: number } | null>(null)
    const moved = React.useRef<number | null>(null) // latest dx while dragging

    const end = (cancelled: boolean) => {
        const s = start.current
        start.current = null
        const distance = moved.current
        moved.current = null
        setDx(0)
        setDragging(false)
        if (!s || cancelled) return
        if (distance === null) {
            if (s.slide >= 0) opts.onTap(s.slide)
        } else if (Math.abs(distance) > opts.threshold) {
            opts.onSwipe(distance < 0 ? 1 : -1)
        }
    }

    const handlers = {
        onPointerDown: (e: React.PointerEvent) => {
            if (!opts.enabled || (e.pointerType === "mouse" && e.button !== 0)) return
            const hit = (e.target as HTMLElement).closest("[data-slide]")
            start.current = {
                x: e.clientX,
                y: e.clientY,
                id: e.pointerId,
                slide: hit ? Number(hit.getAttribute("data-slide")) : -1,
            }
        },
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
            const s = start.current
            if (!s || s.id !== e.pointerId) return
            const x = e.clientX - s.x
            if (moved.current === null) {
                if (Math.abs(x) < 6) return
                if (Math.abs(e.clientY - s.y) > Math.abs(x)) {
                    start.current = null
                    return
                }
                setDragging(true)
                e.currentTarget.setPointerCapture(e.pointerId)
            }
            moved.current = opts.resist(x) ? x * 0.3 : x
            setDx(moved.current)
        },
        onPointerUp: () => end(false),
        onPointerCancel: () => end(true),
    }

    return { dx, dragging, handlers }
}

// One step per sideways trackpad swipe.
function useTrackpadSwipe(
    ref: React.RefObject<HTMLElement>,
    onStep: (dir: 1 | -1) => void
) {
    const latest = React.useRef(onStep)
    latest.current = onStep
    React.useEffect(() => {
        const el = ref.current
        if (!el) return
        let total = 0
        let lockedUntil = 0
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
            e.preventDefault()
            const now = performance.now()
            if (now < lockedUntil) return
            total += e.deltaX
            if (Math.abs(total) > 40) {
                latest.current(total > 0 ? 1 : -1)
                total = 0
                lockedUntil = now + 450
            }
        }
        el.addEventListener("wheel", onWheel, { passive: false })
        return () => el.removeEventListener("wheel", onWheel)
    }, [ref])
}

// ---------- styles ----------

const FILL =
    "var(--token-e7391f06-5b5f-47ea-ab1b-bd067a202255, rgba(238,237,230,0.1))"

const CSS = `
.ec { width: 100%; display: flex; flex-direction: column; gap: 24px; }
.ec :focus-visible { outline: 2px solid var(--c); outline-offset: 3px; }

.ec-viewport {
    position: relative; width: 100%; overflow: hidden; outline: none;
    touch-action: pan-y; user-select: none; cursor: grab;
}
.ec-viewport.dragging, .ec-viewport.dragging .ec-cover { cursor: grabbing; }
.ec-track {
    position: absolute; top: 24px; left: 0; display: flex;
    will-change: transform; transition: transform .6s ${EASE};
}
.ec-slide {
    position: relative; flex-shrink: 0;
    transition: transform .6s ${EASE}, opacity .6s ${EASE};
}
.ec-embed {
    width: ${BASE_W}px; height: ${BASE_H}px;
    transform-origin: top left; pointer-events: none;
}
.ec-slide.active .ec-embed { pointer-events: auto; }
.ec-viewport.dragging .ec-embed { pointer-events: none; }
.ec-cover { position: absolute; inset: 0; cursor: pointer; }
.ec-empty {
    position: absolute; inset: 24px; display: grid; place-items: center;
    padding: 24px; border: 1px dashed var(--c); border-radius: 16px;
    color: var(--c); opacity: .5; text-align: center;
    font: 14px/1.4 system-ui, sans-serif;
}

.ec-title {
    padding: 0 24px; text-align: center;
    font: 400 28px/1.4 "Tiempos Text", serif;
    animation: ec-fade .45s ${EASE};
}
.ec-title a { color: inherit; text-decoration: underline; text-underline-offset: 4px; }
@keyframes ec-fade { from { opacity: 0; transform: translateY(6px); } }

.ec-controls { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 0 24px; }
.ec-arrow {
    display: grid; place-items: center; flex-shrink: 0;
    width: 40px; height: 40px; padding: 0; border: 0; border-radius: 99px;
    background: ${FILL}; color: var(--c); cursor: pointer;
    transition: opacity .2s, transform .2s ${EASE};
}
.ec-arrow:hover:not(:disabled) { transform: scale(1.06); }
.ec-arrow:active:not(:disabled) { transform: scale(.94); }
.ec-arrow:disabled { opacity: .3; cursor: default; }
.ec-dots {
    display: flex; align-items: center; gap: 6px;
    height: 40px; padding: 0 14px; border-radius: 99px; background: ${FILL};
}
.ec-dots button {
    width: 8px; height: 8px; padding: 0; border: 0; border-radius: 99px;
    background: var(--c); opacity: .35; cursor: pointer;
    transition: width .45s ${EASE}, opacity .3s;
}
.ec-dots button[aria-selected="true"] { width: 22px; opacity: 1; }
`

// ---------- Framer panel ----------

addPropertyControls(EmbedCarousel, {
    embeds: {
        type: ControlType.Array,
        title: "CDs",
        control: { type: ControlType.ComponentInstance },
    },
    details: {
        type: ControlType.Array,
        title: "Titles",
        control: {
            type: ControlType.Object,
            controls: {
                title: { type: ControlType.String, title: "Title" },
                link: { type: ControlType.Link, title: "Spotify" },
            },
        },
    },
    loop: { type: ControlType.Boolean, title: "Loop", defaultValue: true },
    gap: { type: ControlType.Number, title: "Gap", defaultValue: 24, min: 0, max: 120, step: 4, unit: "px" },
    sideScale: { type: ControlType.Number, title: "Side size", defaultValue: 0.88, min: 0.6, max: 1, step: 0.02 },
    sideOpacity: { type: ControlType.Number, title: "Side fade", defaultValue: 0.45, min: 0, max: 1, step: 0.05 },
    titleColor: { type: ControlType.Color, title: "Title", defaultValue: "#ffffff" },
    controlColor: { type: ControlType.Color, title: "Controls", defaultValue: "#ffffff" },
})
