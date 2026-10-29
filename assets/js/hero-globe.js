/* Home page hero: decorative globe. An outer wireframe follows the mouse
   slightly, an inner continent globe turns slowly. This is decoration only.
   If WebGL is missing or fails, the CSS fallback ring appears instead and
   every piece of text on the page stays readable.
   Requires assets/js/vendor/three.min.js (Three.js r134, MIT). */
(function () {
  'use strict';

  var canvas = document.getElementById('globe-canvas');
  if (!canvas) return;

  function useFallback() {
    document.documentElement.classList.add('no-hero-globe');
  }

  function webglAvailable() {
    try {
      var probe = document.createElement('canvas');
      return !!(probe.getContext('webgl') || probe.getContext('experimental-webgl'));
    } catch (e) {
      return false;
    }
  }

  if (typeof THREE === 'undefined' || !webglAvailable()) {
    useFallback();
    return;
  }

  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var heroEl = document.getElementById('hero');

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (e) {
    useFallback();
    return;
  }
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    useFallback();
  });

  var W = function () { return canvas.clientWidth || 1; };
  var H = function () { return canvas.clientHeight || 1; };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W(), H(), false);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 1000);

  // Landscape keeps the close, full bleed globe. Portrait (phones) pulls the
  // camera back until the globe spans the screen width instead of flooding it.
  function fitCamera() {
    var aspect = W() / H();
    camera.aspect = aspect;
    camera.position.z = aspect < 1
      ? Math.max(1.55, 0.95 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect))
      : 1.55;
    camera.updateProjectionMatrix();
  }
  fitCamera();

  // Outer wireframe sphere (mouse reactive)
  var outerGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.07 })
  );
  scene.add(outerGlobe);

  // Equator ring on the outer sphere
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(1.001, 1.004, 128),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.12 })
  );
  scene.add(ring);

  // Particle field
  var PARTICLE_COUNT = 350;
  var particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  var particleVelocities = [];
  for (var i = 0; i < PARTICLE_COUNT; i++) {
    var r = 1.1 + Math.random() * 0.7;
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(2 * Math.random() - 1);
    particlePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    particlePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    particlePositions[i * 3 + 2] = r * Math.cos(phi);
    particleVelocities.push({
      x: (Math.random() - 0.5) * 0.0003,
      y: (Math.random() - 0.5) * 0.0003,
      z: (Math.random() - 0.5) * 0.0002
    });
  }
  var particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  scene.add(new THREE.Points(particleGeo, new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.006,
    transparent: true,
    opacity: 0.32,
    sizeAttenuation: true,
    depthWrite: false
  })));

  // Inner continent globe: country outlines drawn onto a canvas texture
  var texSize = window.innerWidth < 768 ? 1024 : 2048;
  var texCanvas = document.createElement('canvas');
  texCanvas.width = texSize;
  texCanvas.height = texSize;
  var ctx = texCanvas.getContext('2d');
  var innerTex = new THREE.CanvasTexture(texCanvas);
  var innerGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.82, 64, 64),
    new THREE.MeshBasicMaterial({
      map: innerTex,
      transparent: true,
      opacity: 1,
      side: THREE.FrontSide,
      depthWrite: false
    })
  );
  scene.add(innerGlobe);

  // Atmospheric rim glow
  var rimGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.86, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        c: { value: 0.48 },
        p: { value: 4.5 },
        glowColor: { value: new THREE.Color(0.9, 0.9, 0.9) }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec3 vViewDir;',
        'void main() {',
        '  vNormal = normalize(normalMatrix * normal);',
        '  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
        '  vViewDir = normalize(-mvPos.xyz);',
        '  gl_Position = projectionMatrix * mvPos;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float c;',
        'uniform float p;',
        'uniform vec3 glowColor;',
        'varying vec3 vNormal;',
        'varying vec3 vViewDir;',
        'void main() {',
        '  float intensity = pow(c - dot(vNormal, vViewDir), p);',
        '  intensity = clamp(intensity, 0.0, 1.0);',
        '  gl_FragColor = vec4(glowColor * intensity, intensity * 0.25);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    })
  );
  scene.add(rimGlow);

  function project(lon, lat) {
    return [((lon + 180) / 360) * texSize, ((90 - lat) / 180) * texSize];
  }

  function drawGeoJSON(data) {
    ctx.clearRect(0, 0, texSize, texSize);
    ctx.strokeStyle = 'rgba(160, 0, 0, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';

    var features = data.features || (data.type === 'Feature' ? [data] : []);
    features.forEach(function (f) {
      var geom = f.geometry;
      if (!geom) return;
      var polys = geom.type === 'Polygon' ? [geom.coordinates]
        : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      polys.forEach(function (poly) {
        poly.forEach(function (ringCoords) {
          if (!ringCoords.length) return;
          ctx.beginPath();
          var s = project(ringCoords[0][0], ringCoords[0][1]);
          ctx.moveTo(s[0], s[1]);
          for (var k = 1; k < ringCoords.length; k++) {
            var prevX = project(ringCoords[k - 1][0], ringCoords[k - 1][1])[0];
            var c = project(ringCoords[k][0], ringCoords[k][1]);
            // Do not draw a line across the antimeridian
            if (Math.abs(c[0] - prevX) > texSize * 0.4) ctx.moveTo(c[0], c[1]);
            else ctx.lineTo(c[0], c[1]);
          }
          ctx.stroke();
        });
      });
    });
    innerTex.needsUpdate = true;
    if (motion.matches) renderOnce();
  }

  // Country outlines come from the same origin. If the file is missing the
  // globe still renders, just without outlines.
  var geoController = typeof AbortController === 'function' ? new AbortController() : null;
  var geoTimeout = setTimeout(function () { if (geoController) geoController.abort(); }, 8000);
  fetch('/assets/data/world.geojson', geoController ? { signal: geoController.signal } : undefined)
    .then(function (r) {
      if (!r.ok) throw new Error('geo fetch failed');
      return r.json();
    })
    .then(function (data) { clearTimeout(geoTimeout); drawGeoJSON(data); })
    .catch(function () { clearTimeout(geoTimeout); });

  // Mouse parallax for the outer globe (off when reduced motion is on)
  var targetX = 0, targetY = 0, currentX = 0, currentY = 0;
  document.addEventListener('mousemove', function (e) {
    if (motion.matches) return;
    targetX = (e.clientX / window.innerWidth - 0.5) * 0.5;
    targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
  });

  // The globe shrinks and fades as the page scrolls down (off with reduced motion)
  var scrollQueued = false;
  function applyScroll() {
    scrollQueued = false;
    if (motion.matches || !heroEl) {
      canvas.style.transform = '';
      canvas.style.opacity = '';
      return;
    }
    var progress = Math.min(window.scrollY / (heroEl.offsetHeight * 0.7), 1);
    canvas.style.transform = 'scale(' + (1 - progress * 0.38).toFixed(3) + ')';
    canvas.style.opacity = (1 - progress).toFixed(3);
  }
  window.addEventListener('scroll', function () {
    if (!scrollQueued) {
      scrollQueued = true;
      requestAnimationFrame(applyScroll);
    }
  }, { passive: true });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      renderer.setSize(W(), H(), false);
      fitCamera();
      if (motion.matches) renderOnce();
    }, 100);
  });

  var innerY = 0;
  var visible = true;
  var lastTime = 0;
  var running = false;

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { threshold: 0 }).observe(canvas);
  }

  function renderOnce() {
    innerGlobe.rotation.x = 0.15;
    rimGlow.rotation.x = 0.15;
    renderer.render(scene, camera);
  }

  function frame(now) {
    // Reduced motion: draw one still frame and stop the loop.
    if (motion.matches) {
      running = false;
      renderOnce();
      return;
    }
    requestAnimationFrame(frame);
    if (!visible) return;

    var dt = Math.min((now - lastTime) / 16.67, 3); // normalized to 60fps, capped
    lastTime = now;

    currentX += (targetX - currentX) * 0.04 * dt;
    currentY += (targetY - currentY) * 0.04 * dt;
    outerGlobe.rotation.y = currentX;
    outerGlobe.rotation.x = currentY;
    ring.rotation.y = currentX;
    ring.rotation.x = currentY;

    innerY += 0.0022 * dt;
    innerGlobe.rotation.y = innerY;
    rimGlow.rotation.y = innerY;

    var pos = particleGeo.attributes.position.array;
    for (var n = 0; n < PARTICLE_COUNT; n++) {
      pos[n * 3] += (particleVelocities[n].x + currentX * 0.0006) * dt;
      pos[n * 3 + 1] += (particleVelocities[n].y - currentY * 0.0006) * dt;
      pos[n * 3 + 2] += particleVelocities[n].z * dt;
      var dx = pos[n * 3], dy = pos[n * 3 + 1], dz = pos[n * 3 + 2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 1.85) {
        pos[n * 3] *= 0.85;
        pos[n * 3 + 1] *= 0.85;
        pos[n * 3 + 2] *= 0.85;
      }
    }
    particleGeo.attributes.position.needsUpdate = true;

    renderOnce();
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  function onMotionChange() {
    applyScroll();
    if (motion.matches) {
      targetX = targetY = currentX = currentY = 0;
      outerGlobe.rotation.set(0, 0, 0);
      ring.rotation.set(0, 0, 0);
    }
    start();
  }
  if (motion.addEventListener) motion.addEventListener('change', onMotionChange);
  else if (motion.addListener) motion.addListener(onMotionChange);

  start();
})();
