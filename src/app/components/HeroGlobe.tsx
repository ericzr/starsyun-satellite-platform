import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from 'next-themes';
import dayTextureUrl from '../../assets/earth/blue-marble-day.webp';
import nightTextureUrl from '../../assets/earth/black-marble-night.webp';
import topologyTextureUrl from '../../assets/earth/earth-topology.webp';
import cloudTextureUrl from '../../assets/earth/earth-clouds.png';

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
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
    const key = new THREE.DirectionalLight(0xffffff, isLight ? 2.15 : 0.95);
    key.position.set(-4.5, 1.8, 2.8);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, isLight ? 1.15 : 0.05));
    if (isLight) {
      // Keep the daylight hemisphere readable against the white page.
      const fill = new THREE.DirectionalLight(0xffffff, 0.58);
      fill.position.set(3, 0, 2);
      scene.add(fill);
    }

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Render the procedural globe immediately; local compressed textures replace it asynchronously.
    const tex = makePlanetTexture();
    tex.anisotropy = maxAniso;
    const sphereMat = new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.02,
      // Neutral graphite/silver treatment keeps daylight in the site's monochrome hacker palette.
      color: isLight ? 0xf1f1f1 : 0x74808e,
      emissive: isLight ? 0x161616 : 0x000000,
      emissiveIntensity: isLight ? 0.1 : 0,
      roughness: isLight ? 0.8 : 1.0,
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
    globe.rotation.set(-0.08, -1.35, 0);
    rig.add(globe);
    // Reduced segment count from 160 to 80 for better initial performance
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.6, 80, 80), sphereMat);
    globe.add(sphere);

    // A tight Fresnel rim gives the planet a soft optical glow without creating
    // the large gray shell that previously surrounded the globe.
    const atmosphereGlowMaterial = createAtmosphereGlowMaterial(isLight);
    const atmosphereGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1.625, 64, 64),
      atmosphereGlowMaterial,
    );
    atmosphereGlow.renderOrder = 1;
    globe.add(atmosphereGlow);

    const disposables: THREE.Texture[] = [tex];
    let disposed = false;
    let nightMaterial: THREE.ShaderMaterial | undefined;
    let cloudMaterial: THREE.ShaderMaterial | undefined;
    let cloudGeometry: THREE.SphereGeometry | undefined;
    let cloudMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | undefined;

    // NASA Blue Marble + elevation + Black Marble are bundled as 2K WebP assets. This removes
    // two cross-origin CDN waits and the previous 2M-pixel main-thread canvas conversion.
    const loader = new THREE.TextureLoader();
    Promise.all([
      loader.loadAsync(dayTextureUrl),
      loader.loadAsync(topologyTextureUrl),
      isLight ? Promise.resolve(null) : loader.loadAsync(nightTextureUrl),
    ]).then(([day, topo, night]) => {
      if (disposed) {
        day.dispose();
        topo.dispose();
        night?.dispose();
        return;
      }

      day.colorSpace = THREE.SRGBColorSpace;
      day.anisotropy = maxAniso;
      day.minFilter = THREE.LinearMipmapLinearFilter;
      topo.colorSpace = THREE.NoColorSpace;
      topo.anisotropy = maxAniso;
      sphereMat.map = day;
      sphereMat.bumpMap = topo;
      sphereMat.bumpScale = 0.055;
      sphereMat.needsUpdate = true;
      disposables.push(day, topo);

      if (night) {
        night.colorSpace = THREE.SRGBColorSpace;
        night.anisotropy = maxAniso;
        night.minFilter = THREE.LinearMipmapLinearFilter;
        camera.updateMatrixWorld();
        const sunDirectionView = key.position.clone().normalize().transformDirection(camera.matrixWorldInverse);
        nightMaterial = createNightLightsMaterial(night, sunDirectionView);
        const nightLights = new THREE.Mesh(sphere.geometry, nightMaterial);
        // Keep the emissive layer coplanar with the terrain so city lights do not
        // read as a separate floating shell at the limb.
        nightLights.scale.setScalar(1.00025);
        nightLights.renderOrder = 2;
        globe.add(nightLights);
        disposables.push(night);
      }
    }).catch(() => {
      // The procedural sphere remains a complete, immediate fallback.
    });

    // A bundled, transparent cloud albedo keeps first paint deterministic and avoids
    // the visible scan stripes in the raw MODIS classification WMS layer. The
    // shader animates two drifting samples so the layer feels alive without another
    // network request or a per-frame canvas update.
    const cloudsTexture = loader.load(cloudTextureUrl);
    cloudsTexture.colorSpace = THREE.NoColorSpace;
    cloudsTexture.wrapS = THREE.RepeatWrapping;
    cloudsTexture.wrapT = THREE.ClampToEdgeWrapping;
    cloudsTexture.minFilter = THREE.LinearMipmapLinearFilter;
    cloudsTexture.anisotropy = maxAniso;
    cloudMaterial = createCloudMaterial(cloudsTexture, isLight);
    // Only a few thousandths above the terrain: enough to avoid z-fighting,
    // close enough that clouds and night lights remain visually attached.
    cloudGeometry = new THREE.SphereGeometry(1.6075, 96, 64);
    cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
    cloudMesh.renderOrder = 3;
    globe.add(cloudMesh);
    disposables.push(cloudsTexture);

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
    let inViewport = true;
    const satWorldPos = new THREE.Vector3();
    const earthWorldPos = new THREE.Vector3();
    const lookAtMatrix = new THREE.Matrix4();
    const parentWorldQuaternion = new THREE.Quaternion();
    const targetQuaternion = new THREE.Quaternion();
    const localQuaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    const tick = () => {
      if (!inViewport || document.hidden) {
        raf = 0;
        return;
      }
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

      sats.forEach((s) => {
        s.pivot.rotation.y += s.speed * dt;
        s.mesh.getWorldPosition(satWorldPos);
        rig.getWorldPosition(earthWorldPos);
        lookAtMatrix.lookAt(satWorldPos, earthWorldPos, up);
        s.pivot.getWorldQuaternion(parentWorldQuaternion);
        targetQuaternion.setFromRotationMatrix(lookAtMatrix);
        localQuaternion.copy(parentWorldQuaternion).invert().multiply(targetQuaternion);
        s.mesh.quaternion.copy(localQuaternion);
      });
      stars.rotation.y += dt * 0.01;
      if (cloudMaterial) cloudMaterial.uniforms.time.value += dt;
      if (cloudMesh) cloudMesh.rotation.y += dt * 0.0018;

      renderer.render(scene, camera);
    };
    tick();

    const resume = () => {
      if (inViewport && !document.hidden && raf === 0) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        resume();
      }
    };
    const viewportObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry?.isIntersecting ?? true;
      if (!inViewport && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        resume();
      }
    }, { rootMargin: '200px' });
    viewportObserver.observe(mount);
    document.addEventListener('visibilitychange', onVisibilityChange);

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
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      viewportObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.dispose();
      nightMaterial?.dispose();
      cloudMaterial?.dispose();
      cloudGeometry?.dispose();
      atmosphereGlow.geometry.dispose();
      atmosphereGlowMaterial.dispose();
      disposables.forEach((d) => d.dispose());
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  return <div ref={mountRef} className={className} style={{ cursor: 'pointer' }} />;
}

function createAtmosphereGlowMaterial(isLight: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(isLight ? 0xd7d7d7 : 0x82bfff) },
      opacity: { value: isLight ? 0.1 : 0.15 },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float opacity;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        float facing = max(dot(normalize(vNormalView), normalize(vViewDirection)), 0.0);
        float rim = pow(1.0 - facing, 4.5);
        float alpha = smoothstep(0.12, 0.92, rim) * opacity;
        gl_FragColor = vec4(glowColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function createNightLightsMaterial(nightMap: THREE.Texture, sunDirectionView: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    uniforms: {
      nightMap: { value: nightMap },
      sunDirectionView: { value: sunDirectionView },
      intensity: { value: 0.92 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      void main() {
        vUv = uv;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D nightMap;
      uniform vec3 sunDirectionView;
      uniform float intensity;
      varying vec2 vUv;
      varying vec3 vNormalView;
      void main() {
        vec3 source = texture2D(nightMap, vUv).rgb;
        vec3 emitted = max(source - vec3(0.105, 0.085, 0.065), vec3(0.0));
        float luminance = max(emitted.r, max(emitted.g, emitted.b));
        float nightSide = 1.0 - smoothstep(-0.24, 0.16, dot(normalize(vNormalView), normalize(sunDirectionView)));
        float glow = smoothstep(0.012, 0.23, luminance);
        float core = smoothstep(0.075, 0.48, luminance);
        float nightVisibility = mix(0.58, 1.0, nightSide);
        float strength = clamp(glow * 0.38 + core * 0.72, 0.0, 1.0);
        vec3 amber = mix(vec3(1.0, 0.18, 0.008), vec3(1.0, 0.72, 0.16), core);
        vec3 warmLights = amber * mix(0.58, 1.0, core) * intensity;
        gl_FragColor = vec4(warmLights, nightVisibility * strength * 0.96);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

function createCloudMaterial(cloudMap: THREE.Texture, isLight: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: { value: cloudMap },
      cloudColor: { value: new THREE.Color(isLight ? 0xe9e9e9 : 0xf3f3f3) },
      opacity: { value: isLight ? 0.14 : 0.12 },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDirection;
      void main() {
        vUv = uv;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudMap;
      uniform vec3 cloudColor;
      uniform float opacity;
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDirection;
      void main() {
        // Two low-speed offsets create a soft parallax drift while preserving the
        // recognizable global cloud structures in the source texture.
        vec2 driftA = vec2(time * 0.006, time * 0.00075);
        vec2 driftB = vec2(-time * 0.0022, time * 0.00042);
        vec2 uvA = vec2(fract(vUv.x + driftA.x), clamp(vUv.y + driftA.y, 0.004, 0.996));
        vec2 uvB = vec2(fract(vUv.x * 1.015 + driftB.x), clamp(vUv.y * 1.015 + driftB.y, 0.004, 0.996));
        vec4 sampleA = texture2D(cloudMap, uvA);
        vec4 sampleB = texture2D(cloudMap, uvB);
        // The source is an alpha cloud mask. Combining alpha with luminance keeps
        // transparent ocean pixels from becoming a gray film over the continents.
        float maskA = sampleA.a * smoothstep(0.18, 0.92, sampleA.r);
        float maskB = sampleB.a * smoothstep(0.18, 0.92, sampleB.r);
        float cloudSignal = smoothstep(0.28, 0.72, maskA * 0.78 + maskB * 0.22);
        float facing = max(dot(normalize(vNormal), normalize(vViewDirection)), 0.0);
        float rimFade = smoothstep(0.02, 0.32, facing);
        float highlight = 0.78 + 0.22 * facing;
        float alpha = cloudSignal * rimFade * opacity;
        gl_FragColor = vec4(cloudColor * highlight, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
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
