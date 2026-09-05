import * as THREE from 'three';
import vert from './shaders/ring.vert.glsl';
import frag from './shaders/ring.frag.glsl';

const RING_RADIUS = 2.45;
const RING_Y = -1.2;
const MAX_DAYS = 371;

export function createRing(caps) {
  const geometry = new THREE.BoxGeometry(0.026, 1, 0.026);
  geometry.translate(0, 0.5, 0); // grow upward from the ring plane
  geometry.setAttribute('aAngle', new THREE.InstancedBufferAttribute(new Float32Array(MAX_DAYS), 1));
  geometry.setAttribute('aLevel', new THREE.InstancedBufferAttribute(new Float32Array(MAX_DAYS), 1));

  const uniforms = {
    uHead: { value: 0 },
    uOpacity: { value: 0.15 },
    uColorLow: { value: new THREE.Color('#1e3a5f') },
    uColorHigh: { value: new THREE.Color('#22d3ee') },
    uColorHot: { value: new THREE.Color('#f0abfc') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_DAYS);
  mesh.count = 0;
  mesh.frustumCulled = false;

  // Pulsing marker on the newest day.
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xf0abfc, transparent: true, opacity: 0.9 }),
  );
  marker.visible = false;

  const group = new THREE.Group();
  group.add(mesh, marker);

  let days = [];
  let headSpeed = caps.reducedMotion ? 0.08 : 0.32;
  const dummy = new THREE.Object3D();

  function setCalendar(calendar) {
    days = (calendar?.days || []).slice(-MAX_DAYS);
    const peak = Math.max(1, calendar?.peak || 0);
    const n = days.length;
    const angles = geometry.getAttribute('aAngle');
    const levels = geometry.getAttribute('aLevel');
    days.forEach((day, i) => {
      const a = (i / n) * Math.PI * 2;
      const level = Math.sqrt(day.c / peak);
      const height = 0.04 + 0.85 * level;
      dummy.position.set(Math.cos(a) * RING_RADIUS, RING_Y, Math.sin(a) * RING_RADIUS);
      dummy.rotation.set(0, -a, 0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      angles.setX(i, a);
      levels.setX(i, level);
    });
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    angles.needsUpdate = true;
    levels.needsUpdate = true;
    if (n) {
      const a = ((n - 1) / n) * Math.PI * 2;
      const last = days[n - 1];
      marker.position.set(Math.cos(a) * RING_RADIUS, RING_Y + 0.04 + 0.85 * Math.sqrt(last.c / peak) + 0.1, Math.sin(a) * RING_RADIUS);
      marker.visible = true;
    }
  }

  return {
    object: group,
    mesh,
    dayAt(instanceId) {
      return days[instanceId] || null;
    },
    update(t, dt, state) {
      uniforms.uHead.value = (uniforms.uHead.value + dt * headSpeed * (0.4 + 0.6 * state.ring)) % (Math.PI * 2);
      const k = 1 - Math.exp(-dt * 3);
      uniforms.uOpacity.value += (state.ring - uniforms.uOpacity.value) * k;
      marker.material.opacity = 0.5 + 0.5 * Math.sin(t * 3.2);
      const s = 1 + 0.35 * Math.sin(t * 3.2);
      marker.scale.setScalar(s * (0.6 + 0.4 * state.ring));
    },
    setSpeed(v) {
      headSpeed = v;
    },
    setCalendar,
    dispose() {
      geometry.dispose();
      material.dispose();
      marker.geometry.dispose();
      marker.material.dispose();
    },
  };
}
