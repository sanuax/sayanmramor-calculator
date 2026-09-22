// transition-layer.js
//
// A small, generic crossfade/slide transition helper -- NOT specific to the
// Adaptive Step Engine. It knows nothing about steps, products, or state;
// it only knows how to swap which of two sibling DOM elements is visible
// inside a container, animating the swap with a short translateY+opacity
// transition whose direction is caller-supplied ('forward'/'backward').
// This is deliberately generic so it can later drive other premium
// micro-transitions (e.g. the 3D viewer reacting to a material/shape/edge
// change) without a second animation system -- see step-engine wiring in
// sayanmramor-calculator.html for the first consumer.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TransitionLayer = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const DEFAULT_DURATION_MS = 300; // within the requested 250-350ms window
  const TRANSLATE_PX = 16;
  const STYLE_PROPS = ['position', 'top', 'left', 'right', 'transform', 'opacity', 'transition'];

  function prefersReducedMotion(win) {
    const w = win || (typeof window !== 'undefined' ? window : null);
    return !!(w && w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // 'forward' (e.g. Далее): outgoing content exits upward, incoming enters
  // from below. 'backward' (Назад): the mirror image. Any other/missing
  // value is treated as 'forward' -- callers that don't care about
  // direction still get a sensible default rather than a broken transition.
  function offsetSignFor(direction) {
    return direction === 'backward' ? 1 : -1;
  }

  function resetInlineStyles(el) {
    STYLE_PROPS.forEach(prop => { el.style[prop] = ''; });
  }

  // crossfade({ container, fromEl, toEl, direction, durationMs, onSettle })
  //
  // - container: the positioned ancestor of fromEl/toEl (its own
  //   position/min-height are touched only for the animation's duration and
  //   fully restored afterwards).
  // - fromEl: currently-visible element, or null/undefined if there is
  //   nothing to animate away (first render).
  // - toEl: element to reveal. Must already be a child of container.
  // - Returns true if an animation was actually started (caller should treat
  //   the transition as "busy" until onSettle fires); false if it resolved
  //   synchronously (fromEl === toEl, or prefers-reduced-motion), in which
  //   case onSettle has already been called before crossfade returns.
  function crossfade(options) {
    const container = options.container;
    const fromEl = options.fromEl || null;
    const toEl = options.toEl;
    const direction = options.direction;
    const duration = options.durationMs || DEFAULT_DURATION_MS;
    const onSettle = options.onSettle || function () {};

    if (!toEl || fromEl === toEl) {
      onSettle();
      return false;
    }

    if (prefersReducedMotion(options.win)) {
      if (fromEl) fromEl.style.display = 'none';
      toEl.style.display = '';
      onSettle();
      return false;
    }

    const sign = offsetSignFor(direction);
    const previousPosition = container.style.position;
    const height = container.getBoundingClientRect().height;
    container.style.position = previousPosition || 'relative';
    container.style.minHeight = height + 'px';

    if (fromEl) {
      fromEl.style.position = 'absolute';
      fromEl.style.top = '0';
      fromEl.style.left = '0';
      fromEl.style.right = '0';
      fromEl.style.transform = 'translateY(0)';
      fromEl.style.opacity = '1';
    }

    toEl.style.display = '';
    toEl.style.position = 'absolute';
    toEl.style.top = '0';
    toEl.style.left = '0';
    toEl.style.right = '0';
    toEl.style.transition = 'none';
    toEl.style.transform = 'translateY(' + (-sign * TRANSLATE_PX) + 'px)';
    toEl.style.opacity = '0';

    // Force the browser to commit the "before" state above before the next
    // frame flips it to the "after" state -- otherwise both sets of styles
    // can get batched into one paint and nothing visibly animates.
    void toEl.offsetHeight;

    requestAnimationFrame(() => {
      const transition = 'transform ' + duration + 'ms ease, opacity ' + duration + 'ms ease';
      if (fromEl) {
        fromEl.style.transition = transition;
        fromEl.style.transform = 'translateY(' + (sign * TRANSLATE_PX) + 'px)';
        fromEl.style.opacity = '0';
      }
      toEl.style.transition = transition;
      toEl.style.transform = 'translateY(0)';
      toEl.style.opacity = '1';
    });

    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      if (fromEl) {
        fromEl.style.display = 'none';
        resetInlineStyles(fromEl);
      }
      resetInlineStyles(toEl);
      container.style.minHeight = '';
      container.style.position = previousPosition;
      onSettle();
    }
    // A trailing timeout (rather than relying solely on 'transitionend',
    // which can fail to fire if the element is hidden/removed mid-flight)
    // guarantees onSettle always runs -- the transition-in-flight guard
    // must never get stuck forever.
    setTimeout(finish, duration + 50);

    return true;
  }

  return { crossfade, prefersReducedMotion, offsetSignFor, DEFAULT_DURATION_MS };
});
