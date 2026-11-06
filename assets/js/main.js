// @ts-check
// CFIT Timetable — product showcase. Plain JavaScript, no dependencies, type-checked with `npm run typecheck`.
// Every feature here is an enhancement: without JavaScript the page still shows every picture, chapter and step.
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
    window.matchMedia('(min-width: 900px)').addEventListener('change', () => setOpen(false));

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

  // ── Workflow: on wide screens the six pictures share one sticky stage ──────────────────────────
  function initFlow() {
    const flow = one('[data-flow]');
    if (!flow) return;
    const steps = all('[data-step]', flow);
    const figures = steps.map((step) => one('.flow-figure', step));
    const rail = one('[data-flow-rail]', flow);
    const railItems = rail ? all('li', rail) : [];
    const wide = window.matchMedia('(min-width: 1100px)');

    /** @type {HTMLElement | null} */ let stage = null;
    let active = 0;
    let queued = false;

    /** @param {number} index */
    const setActive = (index) => {
      active = index;
      steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
      figures.forEach((figure, i) => {
        if (!figure) return;
        figure.classList.toggle('is-active', i === index);
        figure.inert = stage !== null && i !== index;
      });
      railItems.forEach((item, i) => item.classList.toggle('is-active', i === index));
    };

    // The active step is the one whose middle is nearest the middle of the window.
    const pick = () => {
      queued = false;
      const middle = window.innerHeight / 2;
      let best = 0;
      let bestDistance = Infinity;
      steps.forEach((step, i) => {
        const r = step.getBoundingClientRect();
        const distance = Math.abs(r.top + r.height / 2 - middle);
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      });
      setActive(best);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(pick);
    };

    const enhance = () => {
      if (stage) return;
      stage = document.createElement('div');
      stage.className = 'flow-stage';
      if (rail) stage.append(rail);
      const media = document.createElement('div');
      media.className = 'flow-media';
      for (const figure of figures) if (figure) media.append(figure);
      stage.append(media);
      flow.append(stage);
      flow.classList.add('is-enhanced');
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      pick();
    };

    const restore = () => {
      if (!stage) return;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      steps.forEach((step, i) => {
        const figure = figures[i];
        if (figure) {
          figure.inert = false;
          step.append(figure);
        }
      });
      if (rail) flow.prepend(rail);
      stage.remove();
      stage = null;
      flow.classList.remove('is-enhanced');
      setActive(active);
    };

    const apply = () => (wide.matches ? enhance() : restore());
    apply();
    wide.addEventListener('change', apply);
  }

  // ── Tabs (ARIA tabs pattern: arrow keys, Home, End) ─────────────────────────────────────────────
  function initTabs() {
    for (const root of all('[data-tabs]')) {
      const list = one('[role="tablist"]', root);
      const tabs = all('[role="tab"]', root);
      const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls') ?? ''));
      if (!list || tabs.length === 0) continue;
      list.hidden = false;

      /** @param {number} index @param {boolean} focus */
      const select = (index, focus) => {
        tabs.forEach((tab, i) => {
          const on = i === index;
          tab.setAttribute('aria-selected', String(on));
          tab.tabIndex = on ? 0 : -1;
          const panel = panels[i];
          if (panel) panel.hidden = !on;
        });
        if (focus) tabs[index].focus();
      };

      tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => select(i, false));
        tab.addEventListener('keydown', (event) => {
          const last = tabs.length - 1;
          /** @type {Record<string, number>} */
          const keys = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last };
          if (event.key in keys) {
            event.preventDefault();
            select(keys[event.key], true);
          }
        });
      });
      select(0, false);
    }
  }

  // ── The drag-and-drop loop: plays silently while in view, with a pause button ───────────────────
  function initLoops() {
    for (const root of all('[data-loop]')) {
      const video = root.querySelector('[data-loop-video]');
      const button = one('[data-loop-toggle]', root);
      const label = one('[data-loop-label]', root);
      if (!(video instanceof HTMLVideoElement) || !button) continue;
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

  // ── Lightbox: every [data-zoom] picture opens large; arrows, swipe and Escape work ───────────────
  function initLightbox() {
    const dialog = document.querySelector('[data-lightbox]');
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') return;
    const caption = one('[data-lightbox-caption]', dialog);
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.dataset.lightboxImg = '';
    (one('.lightbox-inner', dialog) ?? dialog).prepend(img);

    /** @type {{ full: string, caption: string, alt: string }[]} */
    const items = [];
    /** @type {Map<string, number>} */
    const indexOf = new Map();
    const triggers = all('[data-zoom]');
    for (const trigger of triggers) {
      const full = trigger.dataset.full ?? '';
      if (!full || indexOf.has(full)) continue;
      indexOf.set(full, items.length);
      items.push({ full, caption: trigger.dataset.caption ?? '', alt: trigger.querySelector('img')?.alt ?? '' });
    }

    let index = 0;
    /** @type {HTMLElement | null} */ let opener = null;

    /** @param {number} i */
    const show = (i) => {
      index = (i + items.length) % items.length;
      const item = items[index];
      dialog.classList.add('is-loading');
      img.alt = item.alt;
      img.src = item.full;
      if (caption) caption.textContent = item.caption;
    };
    img.addEventListener('load', () => dialog.classList.remove('is-loading'));
    img.addEventListener('error', () => dialog.classList.remove('is-loading'));

    for (const trigger of triggers) {
      trigger.addEventListener('click', () => {
        opener = trigger;
        show(indexOf.get(trigger.dataset.full ?? '') ?? 0);
        dialog.showModal();
      });
    }
    one('[data-lightbox-close]', dialog)?.addEventListener('click', () => dialog.close());
    one('[data-lightbox-prev]', dialog)?.addEventListener('click', () => show(index - 1));
    one('[data-lightbox-next]', dialog)?.addEventListener('click', () => show(index + 1));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') show(index - 1);
      else if (event.key === 'ArrowRight') show(index + 1);
    });
    // A click on the dark area around the picture closes it.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || (event.target instanceof Element && event.target.classList.contains('lightbox-inner'))) dialog.close();
    });
    let startX = 0;
    dialog.addEventListener('pointerdown', (event) => { startX = event.clientX; });
    dialog.addEventListener('pointerup', (event) => {
      const dx = event.clientX - startX;
      if (event.pointerType !== 'mouse' && Math.abs(dx) > 60) show(dx < 0 ? index + 1 : index - 1);
    });
    dialog.addEventListener('close', () => {
      img.removeAttribute('src');
      opener?.focus();
    });
  }

  const init = () => {
    initHeader();
    initReveal();
    initPlayer();
    initWatchLinks();
    initFlow();
    initTabs();
    initLoops();
    initLightbox();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
