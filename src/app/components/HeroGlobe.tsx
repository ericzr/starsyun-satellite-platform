import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from 'next-themes';

/**
 * A genuine WebGL 3D globe: a lit, texture-mapped sphere that auto-rotates and can be
 * dragged, ringed by satellites travelling on real inclined orbits. Monochrome galaxy look.
 */
export function HeroGlobe({ className, onRigChange }: { className?: string; onRigChange?: (rig: THREE.Group) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 640;
    const height = mount.clientHeight || 640;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 6.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through
    mount.appendChild(renderer.domElement);

    // Set higher texture quality for zoom
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const isLight = themeRef.current === 'light';

    // ---- Lights ----
    // Key light from the LEFT so shadow/terminator falls on the RIGHT
    // Dark mode: dramatic crescent. Light mode: softer but still visible shadow for depth.
    const key = new THREE.DirectionalLight(0xffffff, isLight ? 2.5 : 3.6);
    key.position.set(-4.5, 1.8, 2.8);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, isLight ? 0.5 : 0.05));
    if (isLight) {
      // Subtle fill from right to prevent pure black shadow in light mode
      const fill = new THREE.DirectionalLight(0xffffff, 0.4);
      fill.position.set(3, 0, 2);
      scene.add(fill);
    }

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // ---- Planet texture: procedural fallback now, swap in a real hi-res map when loaded ----
    const tex = makePlanetTexture();
    tex.anisotropy = maxAniso;
    const sphereMat = new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.02,
      roughness: isLight ? 0.85 : 1.0,
      metalness: 0.0,
    });

    // Everything except the starfield lives in `rig`, offset to the right so the
    // hero text on the left stays clear even though the canvas is full-bleed.
    const rig = new THREE.Group();
    rig.position.x = 2.6;
    rig.position.y = -0.3;
    scene.add(rig);

    // Expose rig to parent for animation control
    if (onRigChange) {
      onRigChange(rig);
    }

    // ---- Globe ----
    const globe = new THREE.Group();
    rig.add(globe);
    // Reduced segment count from 160 to 80 for better initial performance
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.6, 80, 80), sphereMat);
    globe.add(sphere);

    const disposables: THREE.Texture[] = [tex];

    // Accurate NASA "blue marble" continents/oceans, desaturated to fit the monochrome
    // look but with lifted midtones so oceans stay visibly gray (never pure black).
    // Use higher resolution texture for better quality when zoomed
    loadMonochromeTexture(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
      maxAniso,
      isLight,
      (hi) => {
        hi.minFilter = THREE.LinearMipmapLinearFilter;
        hi.magFilter = THREE.LinearFilter;
        sphereMat.map = hi;
        sphereMat.needsUpdate = true;
        disposables.push(hi);
      },
    );

    // Real elevation data as a bump map → crisp coastlines & mountain relief (fixes "blurry").
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load('https://unpkg.com/three-globe/example/img/earth-topology.png', (topo) => {
      topo.anisotropy = maxAniso;
      topo.colorSpace = THREE.NoColorSpace;
      sphereMat.bumpMap = topo;
      sphereMat.bumpScale = 0.06;
      sphereMat.needsUpdate = true;
      disposables.push(topo);
    });

    // Atmosphere halo (backside-rendered shell) - reduced segments from 64 to 32
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.72, 32, 32),
      new THREE.MeshBasicMaterial({
        color: isLight ? 0x88ccff : 0xffffff,
        transparent: true,
        opacity: isLight ? 0.08 : 0.07,
        side: THREE.BackSide,
      }),
    );
    globe.add(atmo);

    // Thin latitude/longitude wireframe for a techy feel - reduced segments from 24,16 to 16,12
    const grid = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1.605, 16, 12)),
      new THREE.LineBasicMaterial({
        color: isLight ? 0x000000 : 0xffffff,
        transparent: true,
        opacity: isLight ? 0.12 : 0.05,
      }),
    );
    globe.add(grid);

    // ---- Orbits + satellites ----
    type Sat = { pivot: THREE.Group; speed: number; mesh: THREE.Group };
    const sats: Sat[] = [];
    const orbitDefs = [
      { r: 2.2, incX: 0.5, incZ: 0.2, speed: 0.6, n: 1 },
      { r: 2.6, incX: -0.7, incZ: 0.5, speed: 0.42, n: 2 },
      { r: 3.05, incX: 0.35, incZ: -0.6, speed: 0.3, n: 1 },
      { r: 3.5, incX: -0.4, incZ: 0.3, speed: 0.22, n: 2 },
    ];
    const lineColor = isLight ? 0x111111 : 0xffffff;
    const ringMat = new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: isLight ? 0.45 : 0.22 });

    // Create simplified satellite geometry for better performance
    function createSatellite() {
      const satGroup = new THREE.Group();

      // Refined materials for better visual quality
      const bodyMat = new THREE.MeshStandardMaterial({
        color: isLight ? 0x2a2a2a : 0xd0d0d0,
        metalness: 0.95,
        roughness: 0.15,
      });

      const panelMat = new THREE.MeshStandardMaterial({
        color: isLight ? 0x1a1a1a : 0x505050,
        metalness: 0.2,
        roughness: 0.8,
        emissive: isLight ? 0x0a0a0a : 0x202020,
        emissiveIntensity: isLight ? 0.1 : 0.25,
      });

      const accentMat = new THREE.MeshStandardMaterial({
        color: isLight ? 0x4a4a4a : 0xf0f0f0,
        metalness: 0.98,
        roughness: 0.05,
      });

      // Main body
      const mainBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), bodyMat);
      satGroup.add(mainBody);

      // Top module
      const topModule = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), bodyMat);
      topModule.position.y = 0.045;
      satGroup.add(topModule);

      // Bottom thruster with accent material
      const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.025, 6), accentMat);
      thruster.position.y = -0.0425;
      satGroup.add(thruster);

      // Solar panels with minimal grid for detail
      const panelWidth = 0.16;
      const panelHeight = 0.08;
      const panelThickness = 0.004;

      // Left solar panel
      const leftPanel = new THREE.Mesh(
        new THREE.BoxGeometry(panelWidth, panelHeight, panelThickness),
        panelMat
      );
      leftPanel.position.x = -0.09;
      satGroup.add(leftPanel);

      // Add simplified grid lines (only 3 vertical lines for performance)
      const gridLineMat = new THREE.LineBasicMaterial({
        color: isLight ? 0x000000 : 0xffffff,
        opacity: isLight ? 0.15 : 0.1,
        transparent: true
      });

      for (let i = 1; i <= 3; i++) {
        const x = (i / 4) * panelWidth - panelWidth / 2;
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, -panelHeight / 2, panelThickness / 2 + 0.001),
          new THREE.Vector3(x, panelHeight / 2, panelThickness / 2 + 0.001),
        ]);
        const line = new THREE.Line(lineGeo, gridLineMat);
        line.position.x = -0.09;
        satGroup.add(line);
      }

      // Right solar panel
      const rightPanel = new THREE.Mesh(
        new THREE.BoxGeometry(panelWidth, panelHeight, panelThickness),
        panelMat
      );
      rightPanel.position.x = 0.09;
      satGroup.add(rightPanel);

      // Right panel grid lines
      for (let i = 1; i <= 3; i++) {
        const x = (i / 4) * panelWidth - panelWidth / 2;
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, -panelHeight / 2, panelThickness / 2 + 0.001),
          new THREE.Vector3(x, panelHeight / 2, panelThickness / 2 + 0.001),
        ]);
        const line = new THREE.Line(lineGeo, gridLineMat);
        line.position.x = 0.09;
        satGroup.add(line);
      }

      // Communication dish for detail
      const dish = new THREE.Mesh(
        new THREE.ConeGeometry(0.02, 0.012, 8, 1, true),
        accentMat
      );
      dish.position.set(0, 0.03, 0.03);
      dish.rotation.x = -Math.PI / 4;
      satGroup.add(dish);

      // Main antenna with better material
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.04, 4),
        accentMat
      );
      antenna.position.set(0, 0.06, 0);
      satGroup.add(antenna);

      // Small sensor boxes for detail
      const sensorGeo = new THREE.BoxGeometry(0.012, 0.012, 0.015);
      const sensor1 = new THREE.Mesh(sensorGeo, bodyMat);
      sensor1.position.set(0, 0, 0.032);
      satGroup.add(sensor1);

      const sensor2 = new THREE.Mesh(sensorGeo, bodyMat);
      sensor2.position.set(0, 0, -0.032);
      satGroup.add(sensor2);

      return satGroup;
    }

    orbitDefs.forEach((o) => {
      const plane = new THREE.Group();
      plane.rotation.x = o.incX;
      plane.rotation.z = o.incZ;
      rig.add(plane);

      // ring line
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * o.r, 0, Math.sin(a) * o.r));
      }
      plane.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat));

      for (let s = 0; s < o.n; s++) {
        const pivot = new THREE.Group();
        pivot.rotation.y = Math.random() * Math.PI * 2;
        plane.add(pivot);

        const satelliteMesh = createSatellite();
        satelliteMesh.position.x = o.r;

        // Random rotation for variety
        satelliteMesh.rotation.y = Math.random() * Math.PI * 2;
        satelliteMesh.rotation.z = (Math.random() - 0.5) * 0.5;

        pivot.add(satelliteMesh);
        sats.push({ pivot, speed: o.speed * (0.85 + Math.random() * 0.3), mesh: satelliteMesh });
      }
    });

    // Starfield points behind everything - reduced from 600 to 300 for better performance
    const starGeo = new THREE.BufferGeometry();
    const starN = 300;
    const pos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(14 + Math.random() * 10);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: lineColor, size: 0.05, transparent: true, opacity: isLight ? 0.5 : 0.7 }),
    );
    scene.add(stars);

    // ---- Drag to rotate ----
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let velY = 0.0015; // auto-spin
    let velX = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      velY = dx * 0.005;
      velX = dy * 0.005;
    };
    const onUp = () => {
      dragging = false;
    };
    const el = renderer.domElement;
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // ---- Animate ----
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1); // clamp to avoid jumps after tab-away
      last = now;

      if (!dragging) {
        velY += (0.0015 - velY) * 0.02; // ease back to gentle auto-spin
        velX *= 0.94;
      }
      globe.rotation.y += velY;
      globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + velX, -0.6, 0.6);
      grid.rotation.copy(globe.rotation);

      sats.forEach((s) => {
        s.pivot.rotation.y += s.speed * dt;

        // Make satellite always face the Earth center (origin)
        // Get satellite's world position
        const satWorldPos = new THREE.Vector3();
        s.mesh.getWorldPosition(satWorldPos);

        // Look at Earth center (which is at rig's position in world space)
        const earthWorldPos = new THREE.Vector3();
        rig.getWorldPosition(earthWorldPos);

        // Create a lookAt matrix pointing from satellite to Earth
        const lookAtMatrix = new THREE.Matrix4();
        lookAtMatrix.lookAt(satWorldPos, earthWorldPos, new THREE.Vector3(0, 1, 0));

        // Convert to local space rotation
        const parentWorldQuaternion = new THREE.Quaternion();
        s.pivot.getWorldQuaternion(parentWorldQuaternion);

        const targetQuaternion = new THREE.Quaternion();
        targetQuaternion.setFromRotationMatrix(lookAtMatrix);

        // Apply inverse of parent rotation to get local rotation
        const localQuaternion = new THREE.Quaternion();
        localQuaternion.copy(parentWorldQuaternion).invert().multiply(targetQuaternion);

        s.mesh.quaternion.copy(localQuaternion);
      });
      stars.rotation.y += dt * 0.01;

      renderer.render(scene, camera);
    };
    tick();

    // ---- Resize ----
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.dispose();
      disposables.forEach((d) => d.dispose());
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  return <div ref={mountRef} className={className} style={{ cursor: 'pointer' }} />;
}

/** Load an equirectangular image (CORS), desaturate + tone-map, return a crisp CanvasTexture. */
function loadMonochromeTexture(
  url: string,
  aniso: number,
  isLight: boolean,
  onReady: (t: THREE.CanvasTexture) => void,
) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // Reduce initial texture resolution from 4096x2048 to 2048x1024 for faster loading
    const w = Math.min(img.naturalWidth || 2048, 2048);
    const h = Math.min(img.naturalHeight || 1024, 1024);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const p = data.data;
    // Light mode: brighter floor + stronger land/ocean contrast so the globe is legible
    // on white. Dark mode: keep it moody but still lift oceans off pure black.
    const floor = isLight ? 110 : 30;
    const gain = isLight ? 1.3 : 1.35;
    for (let i = 0; i < p.length; i += 4) {
      let l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      l = Math.min(255, Math.max(0, (l - 12) * gain + floor));
      p[i] = p[i + 1] = p[i + 2] = l;
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    onReady(tex);
  };
  img.onerror = () => {
    /* keep the procedural fallback */
  };
  img.src = url;
}

/** Draw a wide grayscale planetary texture on a canvas (continents-ish blobs + speckle). */
function makePlanetTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  // base dark ocean
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, c.width, c.height);
  // landmass blobs (lighter grays)
  const blob = (n: number, minR: number, maxR: number, shade: number) => {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * c.width;
      const y = Math.random() * c.height;
      const r = minR + Math.random() * (maxR - minR);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${shade},${shade},${shade},0.9)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  blob(14, 40, 120, 120);
  blob(28, 20, 70, 90);
  blob(60, 6, 26, 160);
  // fine speckle
  for (let i = 0; i < 4000; i++) {
    const s = Math.random() * 90 + 30;
    ctx.fillStyle = `rgba(${s},${s},${s},${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
