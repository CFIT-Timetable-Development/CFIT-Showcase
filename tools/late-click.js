// Test helper for tools/qa.mjs (injected with page.addInitScript before the page's own scripts; not used by the site).
// Emulates iPhone Safari's late compatibility click: after a touch, the click is delivered `delay` ms later to
// whatever is then under the finger, because iOS hit-tests when it sends the click, not when the finger lifted.
//   window.__late.delay = 450        hold back the click that follows a touch, then deliver it late
//   window.__late.always = true      also deliver one when the browser sent none (as if touchend could not cancel it)
//   window.__late.landed             where clicks ended up after every handler had its say ([] when none reached the page)
// Automated touch emulation otherwise sends that click within a few milliseconds, while the viewer is still there,
// which hides the bug; this does not make the test a real iPhone.
(() => {
  /** @type {{ delay: number, always: boolean, landed: string[], replayed: number }} */
  const late = { delay: 0, always: false, landed: [], replayed: 0 };
  /** @type {any} */ (window).__late = late;
  /** @type {{ x: number, y: number, t: number } | null} */
  let pending = null;
  let replaying = false;
  const deliver = (/** @type {number} */ x, /** @type {number} */ y) => {
    window.setTimeout(() => {
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      late.replayed += 1;
      replaying = true;
      for (const type of ['mousedown', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, detail: 1, view: window }));
      }
      replaying = false;
    }, late.delay);
  };
  // Only a real tap is followed by a click: a trusted touch that lifted close to where it went down, quickly.
  /** @type {Map<number, { x: number, y: number, t: number }>} */
  const downs = new Map();
  window.addEventListener('pointerdown', (event) => {
    if (event.isTrusted && event.pointerType === 'touch') downs.set(event.pointerId, { x: event.clientX, y: event.clientY, t: performance.now() });
  }, true);
  window.addEventListener('pointerup', (event) => {
    if (late.delay <= 0 || event.pointerType !== 'touch' || !event.isTrusted) return;
    const down = downs.get(event.pointerId);
    downs.delete(event.pointerId);
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12 || performance.now() - down.t > 600) return;
    pending = { x: event.clientX, y: event.clientY, t: performance.now() };
    const mine = pending;
    // A tap the browser turned into no click at all (touchend cancelled): deliver one anyway when asked to.
    window.setTimeout(() => { if (late.always && pending === mine) { pending = null; deliver(mine.x, mine.y); } }, 30);
  }, true);
  for (const type of ['mousedown', 'mouseup', 'click']) {
    window.addEventListener(type, (event) => {
      if (replaying || !event.isTrusted || late.delay <= 0 || !pending) return;
      // The browser's own (immediate) compatibility events: hold them back.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (type === 'click') { const p = pending; pending = null; deliver(p.x, p.y); }
    }, true);
  }
  // Where each click ended up, unless someone cancelled it on the way.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const t = /** @type {Element} */ (event.target);
    const hit = t.closest?.('button, a, [role="button"], summary') ?? t;
    late.landed.push(`${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}.${String(hit.className).split(' ')[0]}`);
  });
})();
