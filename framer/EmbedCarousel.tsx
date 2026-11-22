import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

// Carousel for CD embeds.
// The slides move with a transform, so there is no native scrollbar or scroll
// snapping. Visitors move between slides with:
//   • the arrow buttons and dots under the title
//   • clicking or swiping a neighbouring (peeking) slide
//   • swiping on the empty space around the slides
//   • the left/right arrow keys, or a sideways trackpad swipe
// The centre slide stays fully interactive, so dragging it still spins the CD.

const COUNT = 7
const BASE_W = 774 // size the embed is laid out at, then scaled to fit
const BASE_H = 660
const EASE = "cubic-bezier(.22,.8,.24,1)"

interface Props {
    [key: string]: any
    loop?: boolean
    gap?: number
    peekScale?: number
    peekOpacity?: number
    controlColor?: string
    controlFill?: string
    titleColor?: string
    style?: React.CSSProperties
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export default function EmbedCarousel(props: Props) {
    const {
        loop = true,
        gap = 24,
        peekScale = 0.88,
        peekOpacity = 0.45,
        controlColor = "#ffffff",
        controlFill = "var(--token-e7391f06-5b5f-47ea-ab1b-bd067a202255, rgba(238,237,230,0.1))",
        titleColor = "#ffffff",
    } = props

    const slides = Array.from({ length: COUNT }, (_, i) => ({
        embed: props["embed" + (i + 1)] as React.ReactNode,
        title: props["title" + (i + 1)] as string | undefined,
        spotify: props["spotify" + (i + 1)] as string | undefined,
    })).filter((s) => React.Children.count(s.embed) > 0)
    const n = slides.length

    const viewport = React.useRef<HTMLDivElement>(null)
    const [width, setWidth] = React.useState(1200)
    const [active, setActiveRaw] = React.useState(0)
    const [dragX, setDragX] = React.useState(0)
    const [dragging, setDragging] = React.useState(false)
    const drag = React.useRef<{ x: number; y: number; id: number; slide: number; moved: boolean } | null>(null)

    const current = Math.min(active, Math.max(0, n - 1))
    const card = Math.max(1, Math.min(BASE_W, width - 96))
    const height = (BASE_H * card) / BASE_W
    const step = card + gap

    const go = React.useCallback(
        (i: number) => {
            if (n === 0) return
            setActiveRaw(loop ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)))
        },
        [n, loop]
    )
    const canPrev = n > 1 && (loop || current > 0)
    const canNext = n > 1 && (loop || current < n - 1)

    React.useEffect(() => {
        const el = viewport.current
        if (!el) return
        const ro = new ResizeObserver(() => setWidth(el.clientWidth))
        ro.observe(el)
        setWidth(el.clientWidth)
        return () => ro.disconnect()
    }, [])

    // Sideways trackpad swipe: one slide per gesture.
    React.useEffect(() => {
        const el = viewport.current
        if (!el) return
        let acc = 0
        let lock = 0
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
            e.preventDefault()
            const now = performance.now()
            if (now < lock) return
            acc += e.deltaX
            if (Math.abs(acc) > 40) {
                go(current + (acc > 0 ? 1 : -1))
                acc = 0
                lock = now + 450
            }
        }
        el.addEventListener("wheel", onWheel, { passive: false })
        return () => el.removeEventListener("wheel", onWheel)
    }, [go, current])

    const endDrag = (cancelled: boolean) => {
        const d = drag.current
        drag.current = null
        setDragging(false)
        setDragX(0)
        if (!d || cancelled) return
        if (!d.moved) {
            if (d.slide >= 0 && d.slide !== current) go(d.slide)
            return
        }
        const threshold = Math.min(120, card * 0.18)
        if (dragX < -threshold) go(current + 1)
        else if (dragX > threshold) go(current - 1)
    }

    const offset = width / 2 - card / 2 - current * step + dragX
    const slide = slides[current]

    return (
        <div
            style={{
                ...props.style,
                width: "100%",
                height: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 24,
            }}
            aria-roledescription="carousel"
            aria-label="CD gallery"
        >
            <style>{`
                @keyframes ecFade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
                .ec-btn { transition: opacity .2s, transform .2s ${EASE}, background-color .2s; }
                .ec-btn:not(:disabled):hover { transform: scale(1.06); }
                .ec-btn:not(:disabled):active { transform: scale(.94); }
                .ec-btn:focus-visible, .ec-vp:focus-visible { outline: 2px solid ${controlColor}; outline-offset: 3px; }
            `}</style>

            <div
                ref={viewport}
                className="ec-vp"
                tabIndex={0}
                aria-label="Use the left and right arrow keys to browse"
                onKeyDown={(e) => {
                    if (e.key === "ArrowRight") {
                        e.preventDefault()
                        go(current + 1)
                    } else if (e.key === "ArrowLeft") {
                        e.preventDefault()
                        go(current - 1)
                    }
                }}
                onPointerDown={(e) => {
                    if (n < 2 || (e.pointerType === "mouse" && e.button !== 0)) return
                    const hit = (e.target as HTMLElement).closest("[data-slide]")
                    drag.current = {
                        x: e.clientX,
                        y: e.clientY,
                        id: e.pointerId,
                        slide: hit ? Number(hit.getAttribute("data-slide")) : -1,
                        moved: false,
                    }
                }}
                onPointerMove={(e) => {
                    const d = drag.current
                    if (!d || d.id !== e.pointerId) return
                    const dx = e.clientX - d.x
                    if (!d.moved) {
                        if (Math.abs(dx) < 6) return
                        // Mostly-vertical movement is a page scroll, not a swipe.
                        if (Math.abs(e.clientY - d.y) > Math.abs(dx)) {
                            drag.current = null
                            return
                        }
                        d.moved = true
                        setDragging(true)
                        e.currentTarget.setPointerCapture(e.pointerId)
                    }
                    // Resist past the ends when not looping.
                    const atEdge = !loop && ((current === 0 && dx > 0) || (current === n - 1 && dx < 0))
                    setDragX(atEdge ? dx * 0.3 : dx)
                }}
                onPointerUp={() => endDrag(false)}
                onPointerCancel={() => endDrag(true)}
                style={{
                    position: "relative",
                    width: "100%",
                    height: height + 48,
                    overflow: "hidden",
                    touchAction: "pan-y",
                    cursor: n > 1 ? (dragging ? "grabbing" : "grab") : "default",
                    userSelect: "none",
                    outline: "none",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: 24,
                        left: 0,
                        display: "flex",
                        gap,
                        transform: `translate3d(${offset}px,0,0)`,
                        transition: dragging ? "none" : `transform .6s ${EASE}`,
                        willChange: "transform",
                    }}
                >
                    {slides.map((s, i) => {
                        const isActive = i === current
                        return (
                            <div
                                key={i}
                                data-slide={i}
                                role="group"
                                aria-roledescription="slide"
                                aria-label={`${i + 1} of ${n}${s.title ? ": " + s.title : ""}`}
                                aria-hidden={!isActive}
                                style={{
                                    width: card,
                                    height,
                                    flexShrink: 0,
                                    position: "relative",
                                    transform: `scale(${isActive ? 1 : peekScale})`,
                                    opacity: isActive ? 1 : peekOpacity,
                                    transition: `transform .6s ${EASE}, opacity .6s ${EASE}`,
                                }}
                            >
                                <div
                                    style={{
                                        width: BASE_W,
                                        height: BASE_H,
                                        transform: `scale(${card / BASE_W})`,
                                        transformOrigin: "top left",
                                        pointerEvents: isActive && !dragging ? "auto" : "none",
                                    }}
                                >
                                    {React.Children.map(s.embed, (c) =>
                                        React.isValidElement(c)
                                            ? React.cloneElement(c as React.ReactElement<any>, {
                                                  style: { ...(c.props as any).style, width: BASE_W, height: BASE_H },
                                              })
                                            : c
                                    )}
                                </div>
                                {/* Peeking slides: a cover catches the click or swipe, because the embed would swallow it. */}
                                {!isActive && (
                                    <div
                                        aria-hidden
                                        style={{ position: "absolute", inset: 0, cursor: dragging ? "grabbing" : "pointer" }}
                                    />
                                )}
                            </div>
                        )
                    })}
                </div>

                {n === 0 && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 24,
                            display: "grid",
                            placeItems: "center",
                            border: `1px dashed ${controlColor}55`,
                            borderRadius: 16,
                            color: controlColor,
                            opacity: 0.6,
                            font: "14px/1.4 system-ui, sans-serif",
                            textAlign: "center",
                            padding: 24,
                        }}
                    >
                        Connect an Embed to “Embed 1” in the properties panel
                    </div>
                )}
            </div>

            {slide?.title && (
                <div
                    key={current}
                    aria-live="polite"
                    style={{
                        textAlign: "center",
                        padding: "0 24px",
                        fontFamily: '"Tiempos Text", serif',
                        fontSize: 28,
                        lineHeight: 1.4,
                        fontWeight: 400,
                        color: titleColor,
                        animation: `ecFade .45s ${EASE}`,
                    }}
                >
                    {slide.spotify ? (
                        <a
                            href={slide.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={slide.title + " on Spotify"}
                            style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 4 }}
                        >
                            {slide.title}
                        </a>
                    ) : (
                        <span>{slide.title}</span>
                    )}
                </div>
            )}

            {n > 1 && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 16,
                        padding: "0 24px",
                    }}
                >
                    <ArrowButton
                        dir={-1}
                        disabled={!canPrev}
                        onClick={() => go(current - 1)}
                        color={controlColor}
                        fill={controlFill}
                    />
                    <div
                        role="tablist"
                        aria-label="Choose a CD"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            height: 40,
                            padding: "0 14px",
                            borderRadius: 99,
                            background: controlFill,
                        }}
                    >
                        {slides.map((s, i) => (
                            <button
                                key={i}
                                role="tab"
                                aria-selected={i === current}
                                aria-label={`Go to ${i + 1}${s.title ? ": " + s.title : ""}`}
                                onClick={() => go(i)}
                                style={{
                                    width: i === current ? 22 : 8,
                                    height: 8,
                                    padding: 0,
                                    border: 0,
                                    borderRadius: 99,
                                    background: controlColor,
                                    opacity: i === current ? 1 : 0.35,
                                    cursor: "pointer",
                                    transition: `width .45s ${EASE}, opacity .3s`,
                                }}
                            />
                        ))}
                    </div>
                    <ArrowButton
                        dir={1}
                        disabled={!canNext}
                        onClick={() => go(current + 1)}
                        color={controlColor}
                        fill={controlFill}
                    />
                </div>
            )}
        </div>
    )
}

function ArrowButton(p: { dir: 1 | -1; disabled: boolean; onClick: () => void; color: string; fill: string }) {
    return (
        <button
            className="ec-btn"
            aria-label={p.dir < 0 ? "Previous CD" : "Next CD"}
            disabled={p.disabled}
            onClick={p.onClick}
            style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                padding: 0,
                border: 0,
                borderRadius: 99,
                background: p.fill,
                color: p.color,
                cursor: p.disabled ? "default" : "pointer",
                opacity: p.disabled ? 0.3 : 1,
            }}
        >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                    d={p.dir < 0 ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </button>
    )
}

const slideControls: Record<string, any> = {}
for (let i = 1; i <= COUNT; i++) {
    slideControls["embed" + i] = { type: ControlType.ComponentInstance, title: "Embed " + i }
    slideControls["title" + i] = { type: ControlType.String, title: "Title " + i, defaultValue: "" }
    slideControls["spotify" + i] = { type: ControlType.Link, title: "Spotify " + i }
}

addPropertyControls(EmbedCarousel, {
    loop: { type: ControlType.Boolean, title: "Loop", defaultValue: true },
    gap: { type: ControlType.Number, title: "Gap", defaultValue: 24, min: 0, max: 120, step: 4, unit: "px" },
    peekScale: { type: ControlType.Number, title: "Side size", defaultValue: 0.88, min: 0.6, max: 1, step: 0.02 },
    peekOpacity: { type: ControlType.Number, title: "Side fade", defaultValue: 0.45, min: 0, max: 1, step: 0.05 },
    titleColor: { type: ControlType.Color, title: "Title", defaultValue: "#ffffff" },
    controlColor: { type: ControlType.Color, title: "Controls", defaultValue: "#ffffff" },
    ...slideControls,
})
