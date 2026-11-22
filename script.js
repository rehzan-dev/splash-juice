/* SPLASH — scroll-scrubbed juice site.
   Three tall sections, each with a sticky full-viewport canvas.
   Scroll progress drives the frame by frame, so scrolling down plays
   it forward and scrolling up plays it in reverse.
   Every device scrubs pre-rendered frame-sheets drawn on a <canvas>:
   drawing a frame is instant, so scrubbing stays smooth with no
   decoder stalls. (Desktop used to scrub the <video> itself, but
   seeking stalled on slower connections and the picture hung
   mid-scroll, so the canvas is now the scrub path everywhere.)
   The <video> elements only supply their poster stills until the
   first sheet loads. Videos are muted (audio stripped at encode time).
   Works without JS too: videos fall back to their poster stills. */

(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Live open / closed status (9:00 – 22:00) ---------- */
  var openDot = document.getElementById('openDot');
  var openText = document.getElementById('openText');
  if (openDot && openText) {
    var hour = new Date().getHours();
    var isOpen = hour >= 9 && hour < 22;
    openDot.classList.toggle('is-open', isOpen);
    openText.textContent = isOpen ? 'Open now · closes 10:00 PM' : 'Closed · opens 9:00 AM';
  }

  /* If GSAP failed to load (offline CDN), leave the page as readable
     static content: posters show, copy stays visible. */
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || reducedMotion) {
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Smooth scroll (Lenis), wired into GSAP's ticker ----------
     Desktop only: touch scrolling is already smooth natively, and Lenis
     adds nothing on a phone except another thing that can break scroll. */
  var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) document.documentElement.classList.add('touch-scrub');
  var lenis = null;
  if (typeof Lenis !== 'undefined' && !isTouch) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* Anchor links scroll through Lenis when available. */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0 });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ---------- Header state + top progress bar ---------- */
  var header = document.getElementById('siteHeader');
  var progressBar = document.getElementById('progressBar');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: function (self) {
      if (progressBar) progressBar.style.transform = 'scaleX(' + self.progress + ')';
      if (header) header.classList.toggle('scrolled', self.scroll() > 60);
    }
  });

  /* ---------- Hero entrance ---------- */
  gsap.from('.hero-copy > *', {
    y: 44, opacity: 0, duration: 1.1, stagger: 0.12,
    ease: 'power3.out', delay: 0.25, clearProps: 'all'
  });
  gsap.from('.scroll-cue', { opacity: 0, duration: 1, delay: 1.2 });

  /* ---------- Scene counter ---------- */
  var sceneCurrent = document.getElementById('sceneCurrent');

  /* ---------- Canvas frame-sheets (every device) ----------
     Each scene scrubs pre-rendered frames: 10 fps JPEG sheets, 60
     frames per sheet (10 x 6 grid). Drawing a frame is instant, so
     scrubbing stays smooth with no decoder stalls. Desktop uses
     sharper 960x540 cells; touch keeps lighter 480x270 cells. */
  var FRAMES_PER_SHEET = 60;
  var SHEET_COLS = 10;
  var FRAME_W = isTouch ? 480 : 960;
  var FRAME_H = isTouch ? 270 : 540;
  var SHEET_DIR = isTouch ? 'frames/' : 'frames-hd/';
  var SHEET_VERSION = isTouch ? 'v=5' : 'v=8';
  var FRAME_COUNTS = {
    'mango': 70, 'anaar': 60, 'chocolate': 50
  };

  /* One rAF loop drives every scene's scrub, so work stays in step
     with the display. Each scene registers an update(progress) that
     draws the matching frame. Every scene is updated every frame:
     gating on ScrollTrigger's active state misses scenes at page load
     (onToggle never fires for the initial state) and scenes jumped
     past by a fast scroll, leaving them frozen. */
  var scrubStates = [];
  (function scrubLoop() {
    scrubStates.forEach(function (st) { st.update(st.progress); });
    requestAnimationFrame(scrubLoop);
  })();

  /* ---------- Per-scene: lazy media + scroll scrub + text ---------- */
  document.querySelectorAll('.scene').forEach(function (scene) {
    var video = scene.querySelector('video');
    var canvas = scene.querySelector('canvas');
    var copy = scene.querySelector('.scene-copy');
    var shade = scene.querySelector('.scene-shade');
    var isHero = scene.classList.contains('scene-hero');
    var clipName = video && video.dataset.src
      ? video.dataset.src.split('/').pop().split('?')[0].replace('.mp4', '') : '';

    /* Lazy-load this scene's frame-sheets (two viewports ahead, so
       the next flavour's frames are ready before it arrives). The
       video element is never played — it only shows its poster until
       the first sheet loads. */
    var sheets = [];
    if (canvas && clipName && FRAME_COUNTS[clipName]) {
      var totalSheets = Math.ceil(FRAME_COUNTS[clipName] / FRAMES_PER_SHEET);
      var sheetLoader = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          sheetLoader.disconnect();
          for (var s = 0; s < totalSheets; s++) {
            (function (idx) {
              var img = new Image();
              img.onload = function () { sheets[idx] = img; };
              img.src = SHEET_DIR + clipName + '-' + (idx + 1) + '.jpg?' + SHEET_VERSION;
            })(s);
          }
        });
      }, { rootMargin: '200% 0px 200% 0px' });
      sheetLoader.observe(scene);
    }

    /* The per-scene scrub update: draw the frame matching the scroll
       progress. Before a sheet loads, the canvas stays transparent
       and the video's poster shows through underneath. */
    var ctx = canvas ? canvas.getContext('2d') : null;
    if (canvas) { canvas.width = FRAME_W; canvas.height = FRAME_H; }
    var lastFrame = -1;
    function updateScene(progress) {
      if (!ctx || !clipName || !FRAME_COUNTS[clipName]) return;
      var total = FRAME_COUNTS[clipName];
      var frame = Math.min(total - 1, Math.floor(progress * total));
      if (frame === lastFrame) return;
      var sheet = sheets[Math.floor(frame / FRAMES_PER_SHEET)];
      if (!sheet) return;
      var inSheet = frame % FRAMES_PER_SHEET;
      ctx.drawImage(sheet,
        (inSheet % SHEET_COLS) * FRAME_W,
        Math.floor(inSheet / SHEET_COLS) * FRAME_H,
        FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
      lastFrame = frame;
    }

    /* Scroll progress -> scrub. ScrollTrigger only records the target
       progress (smoothed, 0.5s catch-up); the rAF loop applies it.
       onToggle only moves the scene counter — the scrub itself must
       not depend on it (see the note on the rAF loop above).
       End is 'bottom bottom', not 'bottom top': the scene is 300vh
       tall with a 100vh sticky child, so the section stays pinned
       fullscreen for exactly 200vh of scroll and then slides away.
       'bottom bottom' ends the scrub at 200vh — the video plays its
       FULL duration while it is fullscreen, and only then does the
       next section arrive. ('bottom top' spanned the whole 300vh, so
       the last third of each video played while the next section was
       already sliding in — the viewer never saw one video finish.) */
    var scrubState = { progress: 0, update: updateScene };
    scrubStates.push(scrubState);
    ScrollTrigger.create({
      trigger: scene,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: function (self) { scrubState.progress = self.progress; },
      onToggle: function (self) {
        if (self.isActive && sceneCurrent) sceneCurrent.textContent = scene.dataset.index;
      }
    });

    /* Cinematic settle: media eases from a slight zoom to full frame.
       Same pinned-phase range as the scrub, so the settle and the
       video finish together just as the scene starts to leave. */
    var zoomTarget = canvas;
    if (zoomTarget) {
      gsap.fromTo(zoomTarget, { scale: 1.12 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom bottom', scrub: true }
      });
    }

    /* Shade lifts as you scroll through the scene, so the video
       is fully clear for most of the scroll. */
    if (shade) {
      gsap.fromTo(shade, { opacity: 0.5 }, {
        opacity: 0.1, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom bottom', scrub: true }
      });
    }

    /* Copy: rises in early, drifts out early — the flavour name is
       a label, not the show. The hero only drifts out — its entrance
       is the load animation above. Positions are fractions of the
       200vh pinned scroll: fade-out done by 0.33, so the copy is gone
       well before the video's second half. */
    if (copy) {
      var tl = gsap.timeline({
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom bottom', scrub: true }
      });
      if (!isHero) {
        tl.fromTo(copy, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.10, ease: 'power2.out' }, 0.02);
      }
      tl.to(copy, { y: -60, opacity: 0, duration: 0.10, ease: 'power2.in' }, 0.23);
      /* Pad the timeline to 1s total, so the positions above map 1:1
         to scroll progress — without this, 0.23 would land at 70%. */
      tl.to({}, { duration: 0.67 }, 0.33);
    }

    /* Scene number fades with the copy. */
    var num = scene.querySelector('.scene-num');
    if (num && !isHero) {
      gsap.fromTo(num, { opacity: 0 }, {
        opacity: 1, duration: 0.15, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top top', end: '30% top', scrub: true }
      });
    }
  });

  /* ---------- Footer ---------- */
  gsap.from('.footer-inner > *', {
    y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power2.out',
    scrollTrigger: { trigger: '.site-footer', start: 'top 85%' }
  });
})();
