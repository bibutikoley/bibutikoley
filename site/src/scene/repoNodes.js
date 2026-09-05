import * as THREE from 'three';

function haloTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * One glowing node per repository, orbiting the sphere. More recently pushed
 * repos orbit closer and faster. Labels are DOM elements projected each frame.
 */
export function createNodes(caps, labelsRoot) {
  const group = new THREE.Group();
  const halo = haloTexture();
  const coreGeometry = new THREE.IcosahedronGeometry(0.07, 2);
  const nodes = [];
  let hot = null;
  const tmp = new THREE.Vector3();

  function clearNodes() {
    for (const n of nodes) {
      group.remove(n.pivot);
      n.core.material.dispose();
      n.sprite.material.dispose();
      n.orbit.geometry.dispose();
      n.orbit.material.dispose();
      n.label.remove();
    }
    nodes.length = 0;
  }

  function setRepos(repos) {
    clearNodes();
    repos.slice(0, 9).forEach((repo, i) => {
      const color = new THREE.Color(repo.languageColor || '#8b949e');
      const core = new THREE.Mesh(
        coreGeometry,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
      );
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: halo, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      const haloScale = 0.42 + 0.16 * Math.log1p(repo.stars || 0);
      sprite.scale.setScalar(haloScale);

      const radius = 2.15 + 0.22 * i;
      const pts = [];
      for (let k = 0; k <= 96; k += 1) {
        const a = (k / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const orbit = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x8fb3ff, transparent: true, opacity: 0.08 }),
      );

      // Each orbit lives on its own tilted pivot so the system reads as a shell.
      const pivot = new THREE.Group();
      pivot.rotation.set(0.35 + i * 0.28, i * 0.9, 0.1 * i);
      pivot.add(orbit, core, sprite);
      group.add(pivot);

      const label = document.createElement('div');
      label.className = 'label';
      label.style.setProperty('--dot', repo.languageColor || '#8b949e');
      label.textContent = repo.language ? `${repo.name} · ${repo.language}` : repo.name;
      labelsRoot.append(label);

      nodes.push({
        name: repo.name,
        core,
        sprite,
        orbit,
        pivot,
        label,
        radius,
        phase: i * 2.399,
        speed: 0.16 / (1 + i * 0.18),
        scale: 1,
        angle: i * 2.399,
      });
    });
  }

  function positionOf(n, t) {
    const a = caps.reducedMotion ? n.phase : n.phase + t * n.speed;
    n.angle = a;
    n.core.position.set(Math.cos(a) * n.radius, 0, Math.sin(a) * n.radius);
    n.sprite.position.copy(n.core.position);
  }

  return {
    object: group,
    meshes: () => nodes.map((n) => n.core),
    nameOf(mesh) {
      return nodes.find((n) => n.core === mesh)?.name || null;
    },
    worldPositionOf(name) {
      const n = nodes.find((x) => x.name === name);
      if (!n) return null;
      return n.core.getWorldPosition(tmp.clone());
    },
    setHot(name) {
      hot = name;
      for (const n of nodes) n.label.classList.toggle('hot', n.name === name);
    },
    getHot: () => hot,
    setRepos,
    update(t, dt, state, camera, sectionName) {
      const k = 1 - Math.exp(-dt * 6);
      const showLabels = sectionName === 'work';
      const w = window.innerWidth;
      const hgt = window.innerHeight;
      // Keep labels out from under the cards themselves.
      const grid = showLabels ? document.getElementById('repos')?.getBoundingClientRect() : null;
      for (const n of nodes) {
        positionOf(n, t);
        const target = n.name === hot ? 1.7 : 1;
        n.scale += (target - n.scale) * k;
        n.core.scale.setScalar(n.scale);
        const op = n.name === hot ? 1 : state.nodes;
        n.core.material.opacity += (op - n.core.material.opacity) * k;
        n.sprite.material.opacity += (op * 0.45 - n.sprite.material.opacity) * k;
        n.orbit.material.opacity += (state.nodes * 0.12 - n.orbit.material.opacity) * k;

        // Project to screen for the DOM label.
        n.core.getWorldPosition(tmp).project(camera);
        const x = (tmp.x * 0.5 + 0.5) * w;
        const y = (-tmp.y * 0.5 + 0.5) * hgt;
        let visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
        if (visible && grid && n.name !== hot) {
          visible = !(x > grid.left - 20 && x < grid.right + 20 && y > grid.top - 20 && y < grid.bottom + 20);
        }
        n.label.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - 28).toFixed(1)}px, 0) translateX(-50%)`;
        n.label.classList.toggle('show', visible && (showLabels || n.name === hot));
      }
    },
    dispose() {
      clearNodes();
      coreGeometry.dispose();
      halo.dispose();
    },
  };
}
