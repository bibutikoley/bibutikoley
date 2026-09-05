import * as THREE from 'three';

export const SECTIONS = ['hero', 'now', 'work', 'live', 'highlights', 'activity', 'stack', 'contact'];

// One keyframe per section: where the camera sits, what it looks at, and how
// the scene elements should present themselves.
const KEYS = {
  hero: { pos: [0, 0.2, 5.4], look: [0, 0, 0], side: 1, morph: 0, ring: 0.07, nodes: 0.35, amp: 1 },
  now: { pos: [1.6, 0.9, 4.6], look: [0.3, 0.1, 0], side: 1, morph: 0.35, ring: 0.07, nodes: 0.5, amp: 0.8 },
  work: { pos: [0, 2.6, 6.8], look: [0, 0, 0], side: 0, morph: 0, ring: 0.12, nodes: 1, amp: 0.7 },
  live: { pos: [-2.4, -1.2, 6.4], look: [0, 0.8, 0], side: 0, morph: 0.1, ring: 0.1, nodes: 0.6, amp: 0.85 },
  highlights: { pos: [2.6, 1.4, 5.2], look: [-0.2, 0.2, 0], side: 0, morph: 0.5, ring: 0.1, nodes: 0.4, amp: 0.9 },
  activity: { pos: [0, 6.8, 0.6], look: [0, -1.2, 0], side: 0, morph: 1, ring: 1, nodes: 0.15, amp: 1 },
  stack: { pos: [-2.6, 0.4, 4.8], look: [0, 0, 0], side: 1, morph: 0.2, ring: 0.1, nodes: 0.3, amp: 0.9 },
  contact: { pos: [0, -0.6, 6.6], look: [0, 0.4, 0], side: 0, morph: 0, ring: 0.2, nodes: 0.4, amp: 0.6 },
};

const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param names the section names actually present on the page, in scroll
 *   order (a section without content, like "live", may be hidden).
 */
export function createCameraRig(camera, caps, names = SECTIONS) {
  const pos = new THREE.Vector3().fromArray(KEYS.hero.pos);
  const look = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const state = { morph: 0, ring: 0.12, nodes: 0.35, amp: 1 };
  const parallax = new THREE.Vector2();
  let first = true;
  let order = names.filter((n) => KEYS[n]);

  function keyAt(index) {
    return KEYS[order[Math.max(0, Math.min(order.length - 1, index))]];
  }

  /** Sphere sits right of the text on wide screens, lower and behind it on narrow ones. */
  function layout() {
    const w = window.innerWidth;
    const narrow = w < 720;
    return {
      side: w > 900 ? -1.15 : 0,
      // Portrait screens are much narrower than the sphere: back the camera
      // off and let the sphere sit beneath the copy.
      zoom: narrow ? 1.5 : w < 1000 ? 1.2 : 1,
      lift: narrow ? 0.7 : 0,
    };
  }

  function blend(progress) {
    const i = Math.floor(progress);
    const t = caps.reducedMotion ? Math.round(progress - i) : smooth(Math.min(1, Math.max(0, progress - i)));
    const a = keyAt(i);
    const b = keyAt(i + 1);
    const { side, zoom, lift } = layout();
    targetLook.set(
      lerp(a.look[0] + a.side * side, b.look[0] + b.side * side, t),
      lerp(a.look[1] + a.side * lift, b.look[1] + b.side * lift, t),
      lerp(a.look[2], b.look[2], t),
    );
    targetPos.set(lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t));
    // Zoom out by scaling the camera's offset from what it looks at.
    targetPos.sub(targetLook).multiplyScalar(zoom).add(targetLook);
    state.morph = lerp(a.morph, b.morph, t);
    state.ring = lerp(a.ring, b.ring, t);
    state.nodes = lerp(a.nodes, b.nodes, t);
    state.amp = lerp(a.amp, b.amp, t);
  }

  return {
    state,
    setOrder(next) {
      order = next.filter((n) => KEYS[n]);
    },
    setPointer(nx, ny) {
      parallax.set(nx, ny);
    },
    update(progress, dt) {
      blend(progress);
      const k = first || caps.reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2);
      first = false;
      pos.lerp(targetPos, k);
      look.lerp(targetLook, k);
      camera.position.copy(pos);
      if (!caps.reducedMotion && !caps.coarse) {
        camera.position.x += parallax.x * 0.25;
        camera.position.y += parallax.y * 0.15;
      }
      camera.lookAt(look);
    },
  };
}
