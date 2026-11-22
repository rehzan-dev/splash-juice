/* SPLASH — scroll-scrubbed juice site.
   Three tall sections, each with a sticky full-viewport video.
   Scroll progress drives the video frame by frame, so scrolling down
   plays it forward and scrolling up plays it in reverse.
   Desktop scrubs the <video> itself (currentTime). Phones can't seek
   video smoothly, so touch devices scrub pre-rendered frame-sheets
   drawn on a <canvas> instead — same motion, zero decoder stalls.
   Videos are muted (audio stripped at encode time).
   Works without JS too: videos fall back to their poster stills. */

(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Debug panel (?debug=1) ----------
     Temporary diagnostic: shows the live video state as on-page text
     (currentTime, seeking, buffered ranges, readyState, error) plus
     scroll progress, so a scrub freeze can be diagnosed without
     DevTools. Only appears when the URL contains ?debug=1. */
  if (window.location.search.indexOf('debug=1') !== -1) {
    var panel = document.createElement('pre');
    panel.id = 'debugPanel';
    panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100;margin:0;padding:10px 12px;background:rgba(0,0,0,0.8);color:#7CFC00;font:11px/1.6 monospace;white-space:pre;border-radius:6px;pointer-events:none;max-width:92vw;overflow:hidden;';
    document.body.appendChild(panel);
    setInterval(function () {
      var v = document.querySelector('.scene-mango video');
      var out = ['scrollY=' + Math.round(window.scrollY)];
      if (!v) { panel.textContent = 'no mango video'; return; }
      var buf = [];
      for (var i = 0; i < v.buffered.length; i++) {
        buf.push(v.buffered.start(i).toFixed(1) + '-' + v.buffered.end(i).toFixed(1));
      }
      out.push('src=' + (v.currentSrc ? v.currentSrc.split('/').pop() : '(none)'));
      out.push('currentTime=' + v.currentTime.toFixed(2) + ' / duration=' + (v.duration || 0).toFixed(2));
      out.push('seeking=' + v.seeking + ' readyState=' + v.readyState + ' networkState=' + v.networkState);
      out.push('buffered=' + (buf.join(', ') || 'none'));
      out.push('error=' + (v.error ? v.error.code : 'none'));
      out.push('scrub progress=' + ((typeof scrubStates !== 'undefined' && scrubStates[0]) ? scrubStates[0].progress.toFixed(3) : '?'));
      panel.textContent = out.join('\n');
    }, 200);
  }

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

  /* ---------- Canvas frame-sheets (touch devices) ----------
     Phones can't seek video smoothly, so on touch devices each scene
     scrubs pre-rendered frames instead: 10 fps JPEG sheets, 60 frames
     per sheet (10 x 6 grid, 480x270 each). Drawing a frame is instant,
     so scrubbing stays smooth with no decoder stalls. */
  var FRAMES_PER_SHEET = 60;
  var SHEET_COLS = 10;
  var FRAME_W = 480;
  var FRAME_H = 270;
  var FRAME_COUNTS = {
    'mango': 100, 'anaar': 100, 'chocolate': 100
  };

  /* One rAF loop drives every scene's scrub, so work stays in step
     with the display. Each scene registers an update(progress) — video
     seeking on desktop, canvas frame drawing on touch. Every scene is
     updated every frame: gating on ScrollTrigger's active state misses
     scenes at page load (onToggle never fires for the initial state)
     and scenes jumped past by a fast scroll, leaving them frozen. */
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
      ? video.dataset.src.split('/').pop().replace('.mp4', '') : '';

    /* Desktop: lazy-load the video as the scene approaches (two
       viewports ahead, so the next flavour is always ready). */
    if (!isTouch && video && video.dataset.src) {
      var loader = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !video.src) {
            video.src = video.dataset.src;
            video.preload = 'auto';
            video.load();
            loader.disconnect();
          }
        });
      }, { rootMargin: '200% 0px 200% 0px' });
      loader.observe(scene);
    }

    /* Touch: lazy-load this scene's frame-sheets instead. */
    var sheets = [];
    if (isTouch && canvas && clipName && FRAME_COUNTS[clipName]) {
      var totalSheets = Math.ceil(FRAME_COUNTS[clipName] / FRAMES_PER_SHEET);
      var sheetLoader = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          sheetLoader.disconnect();
          for (var s = 0; s < totalSheets; s++) {
            (function (idx) {
              var img = new Image();
              img.onload = function () { sheets[idx] = img; };
              img.src = 'frames/' + clipName + '-' + (idx + 1) + '.jpg?v=3';
            })(s);
          }
        });
      }, { rootMargin: '200% 0px 200% 0px' });
      sheetLoader.observe(scene);
    }

    /* The per-scene scrub update: video seek on desktop, frame draw
       on touch. Before a sheet loads, the canvas stays transparent
       and the video's poster shows through underneath. */
    var ctx = canvas ? canvas.getContext('2d') : null;
    var lastFrame = -1;
    function updateScene(progress) {
      if (isTouch) {
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
        return;
      }
      if (!video || video.readyState < 1 || !video.duration || video.seeking) return;
      var target = progress * video.duration;
      if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target;
    }

    /* Scroll progress -> scrub. ScrollTrigger only records the target
       progress (smoothed, 0.5s catch-up); the rAF loop applies it.
       onToggle only moves the scene counter — the scrub itself must
       not depend on it (see the note on the rAF loop above).
       End is 'bottom top', not 'bottom bottom': the scene is 300vh
       tall with a 100vh sticky child, so 'bottom bottom' ends the
       scrub after 200vh — the video would sit frozen on its last
       frame for a full viewport before the next section arrives.
       'bottom top' spans the whole 300vh, so the video runs to its
       end exactly as the scene leaves. */
    var scrubState = { progress: 0, update: updateScene };
    scrubStates.push(scrubState);
    ScrollTrigger.create({
      trigger: scene,
      start: 'top top',
      end: 'bottom top',
      scrub: 0.5,
      onUpdate: function (self) { scrubState.progress = self.progress; },
      onToggle: function (self) {
        if (self.isActive && sceneCurrent) sceneCurrent.textContent = scene.dataset.index;
      }
    });

    /* Cinematic settle: media eases from a slight zoom to full frame.
       Same full-section range as the scrub, so the settle and the
       video finish together as the scene leaves. */
    var zoomTarget = isTouch ? canvas : video;
    if (zoomTarget) {
      gsap.fromTo(zoomTarget, { scale: 1.12 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    /* Shade lifts as you scroll through the scene, so the video
       is fully clear for most of the scroll. */
    if (shade) {
      gsap.fromTo(shade, { opacity: 0.5 }, {
        opacity: 0.1, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    /* Copy: rises in early, drifts out early — the flavour name is
       a label, not the show. The hero only drifts out — its entrance
       is the load animation above. Positions are fractions of the
       full 300vh scroll: fade-out done by 0.33, so the copy is gone
       well before the video's second half. */
    if (copy) {
      var tl = gsap.timeline({
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom top', scrub: true }
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
