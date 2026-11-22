# SPLASH — Juice, in motion.

A scroll-scrubbed juice bar site. Three flavours — Mango, Anaar,
Chocolate — each a full-viewport scene: scroll down and the video plays
forward, scroll up and it plays in reverse. Videos are muted (audio
stripped at encode time). Text is minimal on purpose, so the video
stays clear.

## Stack

- Plain HTML/CSS/JS, no build step. GSAP 3.12.5 + ScrollTrigger +
  Lenis 1.1.14, self-hosted in `vendor/` (no CDN dependency).
- Desktop scrubs the `<video>` itself (`currentTime`, one rAF loop).
- Touch devices scrub pre-rendered JPEG frame-sheets on a `<canvas>`
  (10 fps, 60 frames per sheet) — video seeking stutters on phones,
  drawing frames is instant.
- Videos: H.264, 720p, dense keyframes (`-g 12`), no audio, faststart.

## Files

- `index.html` — 3 scenes + minimal footer
- `styles.css` — dark base, one accent per flavour
- `script.js` — scrub engine (video + canvas paths), Lenis, counter
- `assets/logo-mark.png` — SPLASH droplet logo
- `videos/` — 3 web-ready clips (mango, anaar, chocolate)
- `posters/` — middle-frame posters for each clip
- `frames/` — per-scene JPEG frame-sheets for the touch canvas scrub
- `vendor/` — self-hosted GSAP, ScrollTrigger and Lenis

## Source videos

Rehan's own Gemini-generated clips (10s, 720p, 24fps), from his Drive
folder. Order on the page: Mango → Anaar → Chocolate.
