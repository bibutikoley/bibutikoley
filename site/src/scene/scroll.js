/**
 * Turns scroll position into a continuous section index (0 = hero, 1 = now …).
 * A section is exactly "itself" when its centre sits at the viewport centre;
 * in between, the camera glides from one keyframe to the next.
 */
export function createScroll(initialPanels) {
  let panels = initialPanels;
  let centers = [];

  function measure() {
    centers = panels.map((p) => p.offsetTop + p.offsetHeight / 2);
    // The first section counts as fully itself from the very top of the page.
    if (centers.length) centers[0] = Math.min(centers[0], window.innerHeight / 2);
  }
  measure();

  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(measure);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
  }
  // Fonts/images settling can move things after first paint.
  setTimeout(measure, 600);

  return {
    measure,
    setPanels(next) {
      panels = next;
      measure();
    },
    progress() {
      const y = window.scrollY + window.innerHeight * 0.5;
      const n = centers.length;
      if (!n) return 0;
      if (y <= centers[0]) return 0;
      if (y >= centers[n - 1]) return n - 1;
      let i = 0;
      while (i < n - 2 && y >= centers[i + 1]) i += 1;
      const span = Math.max(1, centers[i + 1] - centers[i]);
      return i + Math.max(0, Math.min(1, (y - centers[i]) / span));
    },
  };
}
