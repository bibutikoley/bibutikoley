/** What this device can comfortably render. Decides particle budget, DPR and bloom. */
export function detectCapabilities() {
  const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
  const reducedMotion = mq('(prefers-reduced-motion: reduce)');
  const coarse = mq('(pointer: coarse)');

  let webgl = false;
  try {
    const c = document.createElement('canvas');
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webgl = false;
  }

  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  const small = window.innerWidth < 720;
  let tier = 'mid';
  if (small || cores <= 4 || memory <= 4) tier = 'low';
  else if (cores >= 8 && (window.devicePixelRatio || 1) >= 1.5) tier = 'high';

  const dpr = Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1.25 : 2);
  const particles = { low: 6000, mid: 14000, high: 24000 }[tier];

  return { webgl, reducedMotion, coarse, tier, dpr, particles, bloom: tier !== 'low' && !reducedMotion };
}
