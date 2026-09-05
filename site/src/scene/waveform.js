import * as THREE from 'three';
import vert from './shaders/waveform.vert.glsl';
import frag from './shaders/waveform.frag.glsl';

const WEEKS = 53;
const DAYS = 7;
const RADIUS = 1.6;

/** Points on a Fibonacci sphere; longitude maps to week, latitude to weekday. */
function buildGeometry(count) {
  const positions = new Float32Array(count * 3);
  const rand = new Float32Array(count);
  const week = new Float32Array(count);
  const day = new Float32Array(count);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    positions.set([x * RADIUS, y * RADIUS, z * RADIUS], i * 3);
    rand[i] = Math.random();
    const lon = (Math.atan2(z, x) + Math.PI) / (2 * Math.PI); // 0..1
    const lat = Math.acos(y) / Math.PI; // 0 top .. 1 bottom
    week[i] = Math.min(WEEKS - 1, Math.floor(lon * WEEKS));
    day[i] = Math.min(DAYS - 1, Math.floor(lat * DAYS));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  geometry.setAttribute('aWeek', new THREE.BufferAttribute(week, 1));
  geometry.setAttribute('aDay', new THREE.BufferAttribute(day, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** 53x7 texture of contribution intensity, sqrt-eased so quiet days still show. */
function buildContribTexture(calendar) {
  const data = new Uint8Array(WEEKS * DAYS * 4);
  const days = calendar?.days || [];
  const peak = Math.max(1, calendar?.peak || 0);
  if (days.length) {
    const firstDow = new Date(`${days[0].d}T00:00:00Z`).getUTCDay();
    days.forEach((day, i) => {
      const slot = i + firstDow;
      const w = Math.floor(slot / 7);
      const dow = slot % 7;
      if (w >= WEEKS) return;
      const v = Math.sqrt(day.c / peak);
      const idx = (dow * WEEKS + w) * 4;
      data[idx] = Math.round(v * 255);
      data[idx + 3] = 255;
    });
  }
  const tex = new THREE.DataTexture(data, WEEKS, DAYS, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createWaveform(caps) {
  const geometry = buildGeometry(caps.particles);
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: caps.reducedMotion ? 0.35 : 0.9 },
    uMorph: { value: 0 },
    uHot: { value: new THREE.Vector3(99, 99, 99) },
    uHotT: { value: 0 },
    uPixelRatio: { value: caps.dpr },
    uSize: { value: caps.tier === 'low' ? 2.2 : 1.9 },
    uOpacity: { value: 1 },
    uColorA: { value: new THREE.Color('#22d3ee') },
    uColorB: { value: new THREE.Color('#a78bfa') },
    uContrib: { value: buildContribTexture(null) },
  };

  let material;
  try {
    material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  } catch {
    material = new THREE.PointsMaterial({ size: 0.02, color: 0x22d3ee, transparent: true, opacity: 0.7 });
  }

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);

  let ampTarget = uniforms.uAmp.value;

  return {
    object: group,
    uniforms,
    setCalendar(calendar) {
      const old = uniforms.uContrib.value;
      uniforms.uContrib.value = buildContribTexture(calendar);
      old?.dispose();
    },
    ripple(worldPos) {
      uniforms.uHot.value.copy(worldPos);
      uniforms.uHotT.value = 1;
    },
    update(t, dt, state) {
      uniforms.uTime.value = t;
      const k = 1 - Math.exp(-dt * 3);
      uniforms.uMorph.value += (state.morph - uniforms.uMorph.value) * (caps.reducedMotion ? 1 : k);
      ampTarget = (caps.reducedMotion ? 0.35 : 0.9) * state.amp;
      uniforms.uAmp.value += (ampTarget - uniforms.uAmp.value) * k;
      uniforms.uHotT.value *= Math.exp(-dt * 1.4);
      // Spin as a sphere; settle back to a square-on orientation as it flattens.
      const morph = uniforms.uMorph.value;
      if (!caps.reducedMotion) group.rotation.y += dt * 0.045 * (1 - morph);
      const settled = Math.round(group.rotation.y / (Math.PI * 2)) * Math.PI * 2;
      group.rotation.y += (settled - group.rotation.y) * k * morph;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      uniforms.uContrib.value?.dispose();
    },
  };
}
