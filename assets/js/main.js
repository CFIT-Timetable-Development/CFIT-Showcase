// @ts-check
// CFIT Timetable — product showcase. Plain JavaScript, type-checked with `npm run typecheck`.
// Every feature here is an enhancement: without JavaScript the page still shows every picture, chapter and step,
// and each picture is a link to its full-resolution file.
// The one library, PhotoSwipe (MIT, assets/vendor/photoswipe), is loaded only when a picture is first opened.
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const phone = window.matchMedia('(max-width: 639px)');
  const touch = window.matchMedia('(hover: none), (pointer: coarse)');
  // Relative URLs for the lazily loaded viewer resolve against this script, so the base path never matters.
  const scriptUrl = document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : document.baseURI;

  /**
   * @param {string} selector
   * @param {ParentNode} [root]
   * @returns {HTMLElement[]}
   */
  const all = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector)).filter(
      /** @returns {el is HTMLElement} */ (el) => el instanceof HTMLElement,
    );

  /**
   * @param {string} selector
   * @param {ParentNode} [root]
   * @returns {HTMLElement | null}
   */
  const one = (selector, root = document) => {
    const el = root.querySelector(selector);
    return el instanceof HTMLElement ? el : null;
  };

  /** @param {Promise<void> | undefined} p */
  const quiet = (p) => { if (p) p.catch(() => {}); };

  // ── Header: solid background once scrolled, mobile menu, current section ────────────────────────
  function initHeader() {
    const header = one('[data-header]');
    const toggle = one('[data-nav-toggle]');
    const nav = one('[data-nav]');
    if (!header || !nav) return;

    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /** @param {boolean} open */
    const setOpen = (open) => {
      toggle?.setAttribute('aria-expanded', String(open));
      header.classList.toggle('nav-open', open);
    };
    toggle?.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.classList.contains('nav-open')) {
        setOpen(false);
        toggle?.focus();
      }
    });
    window.matchMedia('(min-width: 1000px)').addEventListener('change', () => setOpen(false));

    if (!('IntersectionObserver' in window)) return;
    /** @type {Map<string, HTMLElement>} */
    const links = new Map();
    for (const a of all('ul a[href^="#"]', nav)) links.set(a.getAttribute('href')?.slice(1) ?? '', a);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const [id, a] of links) {
          if (id === entry.target.id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (const id of ['top', ...links.keys()]) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
  }

  // ── Reveal sections as they scroll into view ───────────────────────────────────────────────────
  function initReveal() {
    const items = all('[data-reveal]');
    if (!('IntersectionObserver' in window) || reduceMotion.matches) {
      for (const el of items) el.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    for (const el of items) observer.observe(el);
  }

  // ── The product film: a poster with one play button, chapters, the current chapter ─────────────
  /** @type {(at?: number) => void} */
  let playFilm = () => {};

  function initPlayer() {
    const video = document.getElementById('film-video');
    if (!(video instanceof HTMLVideoElement)) return;
    const start = one('[data-player-start]');
    const chapterButtons = all('[data-chapters] button');
    const times = chapterButtons.map((b) => Number(b.dataset.time ?? 0));

    if (start instanceof HTMLButtonElement) {
      video.controls = false;
      start.hidden = false;
    }

    /** @param {number} t */
    const seek = (t) => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) video.currentTime = t;
      else video.addEventListener('loadedmetadata', () => { video.currentTime = t; }, { once: true });
    };

    playFilm = (at) => {
      if (start) start.hidden = true;
      video.controls = true;
      if (typeof at === 'number') seek(at);
      quiet(video.play());
    };

    start?.addEventListener('click', () => {
      playFilm();
      video.focus({ preventScroll: true });
    });
    video.addEventListener('play', () => {
      if (start) start.hidden = true;
      video.controls = true;
    });

    chapterButtons.forEach((button, i) => {
      button.addEventListener('click', () => playFilm(times[i]));
    });

    let current = -1;
    const markChapter = () => {
      let index = 0;
      for (let i = 0; i < times.length; i += 1) if (video.currentTime + 0.05 >= times[i]) index = i;
      if (index === current) return;
      current = index;
      chapterButtons.forEach((b, i) => {
        if (i === index) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    };
    video.addEventListener('timeupdate', markChapter);
    video.addEventListener('seeked', markChapter);
  }

  // "Watch Product Film": bring the player into view and start it. Started by the visitor, so sound is on.
  function initWatchLinks() {
    for (const link of all('[data-watch-film]')) {
      link.addEventListener('click', (event) => {
        const player = one('.player-frame');
        if (!player) return;
        event.preventDefault();
        player.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
        history.replaceState(null, '', '#film');
        playFilm();
        const video = document.getElementById('film-video');
        if (video instanceof HTMLVideoElement) video.focus({ preventScroll: true });
      });
    }
  }

  // ── The drag-and-drop loop: plays silently while in view, with a pause button ───────────────────
  // On phones it plays a tighter crop of the same recording (the <source media> picks it); its poster is set here.
  function initLoops() {
    for (const root of all('[data-loop]')) {
      const video = root.querySelector('[data-loop-video]');
      const button = one('[data-loop-toggle]', root);
      const label = one('[data-loop-label]', root);
      if (!(video instanceof HTMLVideoElement) || !button) continue;
      const phonePoster = video.dataset.posterPhone;
      if (phone.matches && phonePoster) {
        video.poster = phonePoster;
        video.width = 712;
        video.height = 1060;
      }
      button.hidden = false;
      // With reduced motion the loop never starts by itself.
      let heldByVisitor = reduceMotion.matches;

      const update = () => {
        const playing = !video.paused;
        root.classList.toggle('is-playing', playing);
        if (label) label.textContent = playing ? 'Pause' : 'Play';
        button.setAttribute('aria-label', playing ? 'Pause the drag-and-drop recording' : 'Play the drag-and-drop recording');
      };
      button.addEventListener('click', () => {
        if (video.paused) {
          heldByVisitor = false;
          quiet(video.play());
        } else {
          heldByVisitor = true;
          video.pause();
        }
      });
      video.addEventListener('play', update);
      video.addEventListener('pause', update);
      update();

      if (!('IntersectionObserver' in window)) continue;
      new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !heldByVisitor) quiet(video.play());
          else if (!entry.isIntersecting && !video.paused) video.pause();
        }
      }, { threshold: 0.35 }).observe(video);
    }
  }

  // ── Image viewer: pinch, double-tap and button zoom, pan, swipe, keyboard (PhotoSwipe) ─────────────
  /**
   * @typedef {{ fit: number, initial: number }} ZoomLevels
   * @typedef {{ x: number, y: number }} Point
   * @typedef {{ src: string, srcset: string, width: number, height: number, alt: string, caption: string }} Item
   */

  // Double-tap or the zoom button go to the application's real size (the recordings are at twice the
  // screen's pixel density), and at least twice the fitted size; pinch goes up to one image pixel per CSS pixel.
  /** @param {ZoomLevels} zl */
  const secondaryZoom = (zl) => Math.max(zl.fit * 2, Math.min(1, Math.max(zl.fit * 2.5, 0.5)));
  /** @param {ZoomLevels} zl */
  const maxZoom = (zl) => Math.max(1, zl.fit * 4);

  /** The device's safe-area insets (notch, home indicator), read once from CSS. */
  const safeArea = () => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe);
    const s = getComputedStyle(probe);
    const inset = { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
    probe.remove();
    return inset;
  };

  /** @param {Point} viewport */
  const isNarrow = (viewport) => viewport.x < 700 || (touch.matches && viewport.y < 520);

  function initViewer() {
    const triggers = all('[data-zoom]');
    if (triggers.length === 0) return;

    /** @type {Item[]} */
    const items = [];
    /** @type {Map<string, number>} */
    const indexOf = new Map();
    for (const trigger of triggers) {
      const src = trigger.getAttribute('href') ?? '';
      if (!src || indexOf.has(src)) continue;
      indexOf.set(src, items.length);
      items.push({
        src,
        srcset: trigger.dataset.srcset ?? '',
        width: Number(trigger.dataset.w),
        height: Number(trigger.dataset.h),
        alt: trigger.querySelector('img')?.alt ?? '',
        caption: trigger.dataset.caption ?? '',
      });
    }

    /** @type {Promise<any> | null} */
    let loading = null;
    const load = () => {
      if (loading) return loading;
      const css = new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL('../vendor/photoswipe/photoswipe.css', scriptUrl).href;
        link.onload = () => resolve(true);
        link.onerror = () => resolve(false);
        // Before main.css, so the site's viewer theme wins over the library's defaults.
        const main = document.querySelector('link[rel="stylesheet"]');
        document.head.insertBefore(link, main);
      });
      const code = import(new URL('../vendor/photoswipe/photoswipe.esm.min.js', scriptUrl).href);
      loading = Promise.all([code, css]).then(([module]) => module.default);
      loading.catch(() => { loading = null; });
      return loading;
    };
    // Start fetching the viewer as soon as a picture is approached (load() runs once and is then cached).
    for (const type of ['pointerover', 'focusin', 'touchstart']) {
      document.addEventListener(type, (event) => {
        if (event.target instanceof Element && event.target.closest('[data-zoom]')) quiet(load().then(() => {}));
      }, { passive: true });
    }

    let busy = false;
    /** @param {number} index @param {HTMLElement} trigger */
    const open = async (index, trigger) => {
      if (busy) return;
      busy = true;
      try {
        const PhotoSwipe = await load();
        const inset = safeArea();
        /** @type {HTMLElement | null} */ let caption = null;
        /** @type {HTMLElement | null} */ let hint = null;

        const pswp = new PhotoSwipe({
          dataSource: items,
          index,
          mainClass: 'cfit-viewer',
          bgOpacity: 1,
          spacing: 0.06,
          showHideAnimationType: 'fade',
          initialZoomLevel: 'fit',
          secondaryZoomLevel: secondaryZoom,
          maxZoomLevel: maxZoom,
          imageClickAction: 'zoom',
          bgClickAction: 'close',
          doubleTapAction: 'zoom',
          // A tap outside the picture closes the viewer; a tap on the picture does nothing (double-tap zooms).
          tapAction: (/** @type {Point} */ _point, /** @type {PointerEvent} */ event) => {
            const onImage = event.target instanceof Element && event.target.closest('.pswp__img');
            if (!onImage && !isZoomed()) pswp.close();
          },
          // Room at the top for the buttons and at the bottom for the caption, hint and (on phones) the arrows.
          paddingFn: (/** @type {Point} */ viewport) => (isNarrow(viewport)
            ? { top: 62 + inset.top, bottom: 136 + inset.bottom, left: inset.left, right: inset.right }
            : { top: 72, bottom: 124, left: 84 + inset.left, right: 84 + inset.right }),
          closeTitle: 'Close',
          zoomTitle: 'Zoom in',
          arrowPrevTitle: 'Previous picture',
          arrowNextTitle: 'Next picture',
          errorMsg: 'This picture could not be loaded.',
          indexIndicatorSep: ' / ',
        });

        const isZoomed = () => {
          const slide = pswp.currSlide;
          return Boolean(slide && slide.currZoomLevel > slide.zoomLevels.initial * 1.02);
        };

        // The caption sits just under the picture while it fits, and fades out while zoomed in, so it never covers it.
        const update = () => {
          const root = pswp.element;
          const slide = pswp.currSlide;
          if (!root || !slide) return;
          const zoomed = isZoomed();
          root.classList.toggle('is-zoomed', zoomed);
          const zoomButton = root.querySelector('.pswp__button--zoom');
          if (zoomButton) {
            const text = zoomed ? 'Fit to screen' : 'Zoom in';
            zoomButton.setAttribute('aria-label', text);
            zoomButton.setAttribute('title', text);
          }
          if (hint) {
            hint.textContent = touch.matches
              ? (zoomed ? 'Drag to look · double-tap to fit' : 'Pinch or double-tap to zoom')
              : (zoomed ? 'Drag to look around · click to fit' : 'Click to zoom · ← → next picture');
          }
          if (caption && caption.textContent !== (slide.data.caption ?? '')) caption.textContent = slide.data.caption ?? '';
          if (caption && !zoomed) {
            const box = slide.content?.element?.getBoundingClientRect();
            const narrow = isNarrow({ x: window.innerWidth, y: window.innerHeight });
            const limit = window.innerHeight - inset.bottom - (narrow ? 70 : 66) - caption.offsetHeight;
            const top = box && box.height > 0 ? Math.min(box.bottom + 14, limit) : limit;
            caption.style.top = `${Math.max(0, Math.round(top))}px`;
          }
        };

        pswp.on('uiRegister', () => {
          pswp.ui.registerElement({
            name: 'cfit-caption', className: 'cfit-caption', appendTo: 'root', tagName: 'p',
            onInit: (/** @type {HTMLElement} */ el) => { caption = el; el.id = 'cfit-viewer-caption'; },
          });
          pswp.ui.registerElement({
            name: 'cfit-hint', className: 'cfit-hint', appendTo: 'root', tagName: 'p',
            onInit: (/** @type {HTMLElement} */ el) => { hint = el; el.setAttribute('aria-hidden', 'true'); },
          });
        });
        pswp.on('afterInit', () => {
          const root = pswp.element;
          if (!root) return;
          // Browsers drop a tap that interrupts the momentum of a swipe, so a quick tap on Close right after a swipe
          // would produce no click. Close on the touch release itself.
          const closeButton = /** @type {Element | null} */ (root.querySelector('.pswp__button--close'));
          let pressed = false;
          closeButton?.addEventListener('pointerdown', (event) => { pressed = event instanceof PointerEvent && event.pointerType !== 'mouse'; });
          closeButton?.addEventListener('pointerup', (event) => {
            if (pressed && event instanceof PointerEvent && event.pointerType !== 'mouse') pswp.close();
            pressed = false;
          });
          root.setAttribute('aria-label', 'Picture viewer');
          root.setAttribute('aria-modal', 'true');
          root.setAttribute('aria-describedby', 'cfit-viewer-caption');
          update();
        });
        for (const name of ['change', 'zoomPanUpdate', 'resize', 'imageSizeChange', 'loadComplete', 'openingAnimationEnd']) pswp.on(name, update);
        pswp.on('destroy', () => {
          if (document.activeElement === document.body || document.activeElement === null) trigger.focus({ preventScroll: true });
        });
        pswp.init();
      } catch {
        // Without the viewer (offline, blocked script), open the picture itself.
        window.location.href = trigger.getAttribute('href') ?? '';
      } finally {
        busy = false;
      }
    };

    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const trigger = event.target instanceof Element ? event.target.closest('[data-zoom]') : null;
      if (!(trigger instanceof HTMLElement)) return;
      const index = indexOf.get(trigger.getAttribute('href') ?? '');
      if (index === undefined) return;
      event.preventDefault();
      quiet(open(index, trigger));
    });
  }

  const init = () => {
    initHeader();
    initReveal();
    initPlayer();
    initWatchLinks();
    initLoops();
    initViewer();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
