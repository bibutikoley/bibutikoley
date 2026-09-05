import * as THREE from 'three';
import { detectCapabilities } from './capabilities.js';
import { createWaveform } from './waveform.js';
import { createRing } from './contributionRing.js';
import { createNodes } from './repoNodes.js';
import { createCameraRig, SECTIONS } from './camera.js';
import { createScroll } from './scroll.js';
import { highlightCard } from '../ui/work.js';

/**
 * Boots the Three.js scene behind the page. Returns null when WebGL is not
 * available so the caller can mount the CSS fallback instead.
 */
export async function createScene(canvas, data, shownRepos) {
  const caps = detectCapabilities();
  if (!caps.webgl) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: caps.tier !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
  } catch (err) {
    console.warn('WebGLRenderer failed', err);
    return null;
  }
  renderer.setPixelRatio(caps.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x05070d, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);

  const labelsRoot = document.getElementById('labels');
  const tooltip = document.getElementById('tooltip');
  const waveform = createWaveform(caps);
  const ring = createRing(caps);
  const nodes = createNodes(caps, labelsRoot);
  scene.add(waveform.object, ring.object, nodes.object);

  const panels = SECTIONS.map((name) => document.querySelector(`[data-scene="${name}"]`)).filter(Boolean);
  const scroll = createScroll(panels);
  const rig = createCameraRig(camera, caps);

  let composer = null;
  if (caps.bloom) {
    try {
      const { createComposer } = await import('./postfx.js');
      composer = createComposer(renderer, scene, camera);
    } catch (err) {
      console.warn('Bloom unavailable, rendering without post-processing.', err);
    }
  }

  // ----- data
  function setData(nextData, nextShown) {
    waveform.setCalendar(nextData.calendar);
    ring.setCalendar(nextData.calendar);
    nodes.setRepos(nextShown || []);
  }
  setData(data, shownRepos);

  // ----- interaction
  let section = document.body.dataset.section || 'hero';
  document.addEventListener('section:change', (e) => {
    section = e.detail.name;
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);
  let pointerActive = false;
  let hoveredDay = null;

  function highlight(name, on) {
    const current = nodes.getHot();
    if (on) {
      if (current === name) return;
      nodes.setHot(name);
      const wp = nodes.worldPositionOf(name);
      if (wp) waveform.ripple(wp);
      highlightCard(name, true);
    } else if (current === name || name == null) {
      nodes.setHot(null);
      highlightCard(current, false);
    }
  }
  document.addEventListener('repo:hover', (e) => highlight(e.detail.name, e.detail.on));

  function onPointerMove(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    pointerActive = true;
    rig.setPointer(pointer.x, pointer.y);
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', () => {
    pointerActive = false;
  });

  function pick() {
    if (!pointerActive) return;
    raycaster.setFromCamera(pointer, camera);

    // Repo nodes (any section; they are always somewhere on screen).
    const hits = raycaster.intersectObjects(nodes.meshes(), false);
    const hitName = hits.length ? nodes.nameOf(hits[0].object) : null;
    if (hitName) {
      canvas.style.cursor = 'pointer';
      if (nodes.getHot() !== hitName) highlight(hitName, true);
    } else {
      canvas.style.cursor = '';
      const hot = nodes.getHot();
      // Only release hovers the scene itself created, not ones from the cards.
      if (hot && !document.querySelector(`.repo[data-repo="${CSS.escape(hot)}"]:hover, .repo[data-repo="${CSS.escape(hot)}"]:focus-within`)) {
        highlight(hot, false);
      }
    }

    // Contribution ring tooltip, only when the ring is the star of the show.
    if (section === 'activity' && ring.mesh.count) {
      const rh = raycaster.intersectObject(ring.mesh, false);
      const day = rh.length ? ring.dayAt(rh[0].instanceId) : null;
      if (day && day !== hoveredDay) {
        hoveredDay = day;
        tooltip.textContent = `${day.d} · ${day.c} contribution${day.c === 1 ? '' : 's'}`;
        tooltip.hidden = false;
      } else if (!day && hoveredDay) {
        hoveredDay = null;
        tooltip.hidden = true;
      }
      if (day) {
        tooltip.style.left = `${((pointer.x + 1) / 2) * window.innerWidth}px`;
        tooltip.style.top = `${((1 - pointer.y) / 2) * window.innerHeight}px`;
      }
    } else if (hoveredDay) {
      hoveredDay = null;
      tooltip.hidden = true;
    }
  }

  // Clicking a node in empty space focuses its card.
  window.addEventListener('click', (e) => {
    if (e.target !== canvas) return;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(nodes.meshes(), false);
    if (!hits.length) return;
    const name = nodes.nameOf(hits[0].object);
    highlight(name, true);
    highlightCard(name, true, { scroll: true });
    document.querySelector(`.repo[data-repo="${CSS.escape(name)}"] a`)?.focus({ preventScroll: true });
  });

  // ----- resize / visibility
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
  }
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(resize);
  });

  // ----- loop
  let running = true;
  let last = performance.now();
  let t = 0;
  let frames = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt * (caps.reducedMotion ? 0.3 : 1);

    rig.update(scroll.progress(), dt);
    const st = rig.state;
    waveform.update(t, dt, st);
    ring.update(t, dt, st);
    nodes.update(t, dt, st, camera, section);
    if ((frames += 1) % 2 === 0) pick(); // raycast every other frame

    if (composer) composer.render();
    else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    const shouldRun = !document.hidden;
    if (shouldRun && !running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    } else if (!shouldRun) {
      running = false;
    }
  });

  return {
    setData,
    highlight,
    caps,
    destroy() {
      running = false;
      composer?.dispose();
      waveform.dispose();
      ring.dispose();
      nodes.dispose();
      renderer.dispose();
    },
  };
}
