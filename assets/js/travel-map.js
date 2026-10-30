/* About page: interactive travel map.
   The list of places lives in the page HTML (#place-groups). This script reads
   it, draws pins on a globe, and turns each list item into a button that
   brings that place to the front. Without JavaScript or WebGL the plain list
   is still there. Requires assets/js/vendor/three.min.js (Three.js r134, MIT). */
(function () {
  'use strict';

  var canvas = document.getElementById('map-globe');
  if (!canvas) return;

  var doc = document.documentElement;
  var fallbackNote = document.getElementById('map-fallback-note');

  function useFallback() {
    doc.classList.add('no-map');
    if (fallbackNote) fallbackNote.hidden = false;
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

  var stage = canvas.parentElement;
  var labelLayer = document.getElementById('map-label-layer');
  var panel = document.getElementById('map-panel');
  var activePlace = document.getElementById('map-active-place');
  var activeMeta = document.getElementById('map-active-meta');
  var statusEl = document.getElementById('map-status');
  var toggleBtn = document.getElementById('map-toggle');
  var resetBtn = document.getElementById('map-reset');
  var controls = document.getElementById('map-controls');
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.position.z = 2.9; // far enough back that the whole globe and its glow fit the frame

  var dirty = true;
  function setSize() {
    var w = stage.clientWidth || 1;
    var h = canvas.clientHeight || Math.min(Math.max(360, w * 0.58), 720);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  setSize();

  var INITIAL = { x: -0.08, y: -3.25 };
  var root = new THREE.Group();
  root.rotation.set(INITIAL.x, INITIAL.y, 0);
  scene.add(root);

  var RADIUS = 1;
  root.add(new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 96, 96),
    new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.94 })
  ));
  root.add(new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS * 1.002, 72, 72),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.018, depthWrite: false })
  ));

  var texSize = window.innerWidth < 768 ? 1024 : 2048;
  var texCanvas = document.createElement('canvas');
  texCanvas.width = texSize;
  texCanvas.height = texSize;
  var ctx = texCanvas.getContext('2d');
  var mapTex = new THREE.CanvasTexture(texCanvas);
  mapTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

  root.add(new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS * 1.006, 96, 96),
    new THREE.MeshBasicMaterial({ map: mapTex, transparent: true, opacity: 0.98, depthWrite: false })
  ));

  root.add(new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS * 1.055, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: {
        c: { value: 0.35 },
        p: { value: 3.2 },
        glowColor: { value: new THREE.Color(0.72, 0.72, 0.72) }
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
        '  gl_FragColor = vec4(glowColor * intensity, intensity * 0.32);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    })
  ));

  // ---- Map texture: graticule plus country outlines -------------------------

  function project(lon, lat) {
    return [((lon + 180) / 360) * texSize, ((90 - lat) / 180) * texSize];
  }

  function strokeRing(ring, strokeStyle, lineWidth) {
    if (!ring || ring.length < 2) return;
    ctx.beginPath();
    var start = project(ring[0][0], ring[0][1]);
    ctx.moveTo(start[0], start[1]);
    for (var i = 1; i < ring.length; i++) {
      var prev = project(ring[i - 1][0], ring[i - 1][1]);
      var next = project(ring[i][0], ring[i][1]);
      if (Math.abs(next[0] - prev[0]) > texSize * 0.45) ctx.moveTo(next[0], next[1]);
      else ctx.lineTo(next[0], next[1]);
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function fillRing(ring, fillStyle) {
    if (!ring || ring.length < 3) return;
    ctx.beginPath();
    var start = project(ring[0][0], ring[0][1]);
    ctx.moveTo(start[0], start[1]);
    for (var i = 1; i < ring.length; i++) {
      var pt = project(ring[i][0], ring[i][1]);
      ctx.lineTo(pt[0], pt[1]);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function drawGraticule() {
    ctx.clearRect(0, 0, texSize, texSize);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var ring, lat, lon;
    for (lat = -60; lat <= 60; lat += 30) {
      ring = [];
      for (lon = -180; lon <= 180; lon += 2) ring.push([lon, lat]);
      strokeRing(ring, 'rgba(255,255,255,0.08)', texSize >= 2048 ? 0.9 : 0.65);
    }
    for (lon = -150; lon <= 180; lon += 30) {
      ring = [];
      for (lat = -82; lat <= 82; lat += 2) ring.push([lon, lat]);
      strokeRing(ring, 'rgba(255,255,255,0.06)', texSize >= 2048 ? 0.75 : 0.55);
    }
    mapTex.needsUpdate = true;
    dirty = true;
  }

  function drawGeoJSON(data) {
    drawGraticule();
    var features = data.features || (data.type === 'Feature' ? [data] : []);
    var rings = [];
    features.forEach(function (feature) {
      var geom = feature.geometry;
      if (!geom) return;
      var polys = geom.type === 'Polygon' ? [geom.coordinates]
        : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      polys.forEach(function (poly) {
        poly.forEach(function (r) { rings.push(r); });
      });
    });
    rings.forEach(function (r) { fillRing(r, 'rgba(90,10,10,0.16)'); });
    rings.forEach(function (r) { strokeRing(r, 'rgba(176,16,16,0.62)', texSize >= 2048 ? 4.4 : 2.8); });
    rings.forEach(function (r) { strokeRing(r, 'rgba(255,255,255,0.78)', texSize >= 2048 ? 0.95 : 0.68); });
    mapTex.needsUpdate = true;
    dirty = true;
  }

  drawGraticule();

  // Same origin file. If it is missing the globe still works, without outlines.
  var geoController = typeof AbortController === 'function' ? new AbortController() : null;
  var geoTimeout = setTimeout(function () { if (geoController) geoController.abort(); }, 8000);
  fetch('/assets/data/world.geojson', geoController ? { signal: geoController.signal } : undefined)
    .then(function (response) {
      if (!response.ok) throw new Error('geo fetch failed');
      return response.json();
    })
    .then(function (data) { clearTimeout(geoTimeout); drawGeoJSON(data); })
    .catch(function () { clearTimeout(geoTimeout); });

  // ---- Places, read from the page ------------------------------------------

  function latLngToVec3(lat, lng, r) {
    var phi = (90 - lat) * (Math.PI / 180);
    var theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }

  var locations = [];
  var locationById = {};
  var countries = {};
  var items = document.querySelectorAll('#place-groups li[data-id]');
  Array.prototype.forEach.call(items, function (li) {
    var loc = {
      id: li.getAttribute('data-id'),
      name: li.getAttribute('data-name'),
      region: li.getAttribute('data-region'),
      lat: parseFloat(li.getAttribute('data-lat')),
      lng: parseFloat(li.getAttribute('data-lng')),
      type: li.getAttribute('data-type') || 'us',
      label: li.hasAttribute('data-label'),
      country: li.getAttribute('data-country'),
      li: li
    };
    if (!loc.id || isNaN(loc.lat) || isNaN(loc.lng)) return;
    locations.push(loc);
    locationById[loc.id] = loc;
    countries[loc.country || loc.region] = true;
  });

  if (!locations.length) {
    useFallback();
    return;
  }

  // Wording is the same kind of claim for every pin: a place visited or spent
  // time in. Only the hometown and the current home get their own line.
  function describe(loc) {
    if (loc.type === 'current') return 'Where I live now, on the Mediterranean coast.';
    if (loc.type === 'origin') return 'Where I am originally from.';
    if (loc.type === 'international') return 'A place outside the United States where I have spent time.';
    return 'A place in the United States where I have spent time.';
  }

  // Pins too close to render apart get a small render only offset (nudge) so
  // each place shows as its own dot. True coordinates are unchanged.
  function pinLat(loc) { return loc.lat + (loc.nudge ? loc.nudge[0] : 0); }
  function pinLng(loc) { return loc.lng + (loc.nudge ? loc.nudge[1] : 0); }
  (function declutterPins() {
    var MERGE_DEG = 0.85;
    var SPREAD_DEG = 1.4;
    var seen = {};
    locations.forEach(function (loc, i) {
      if (seen[i]) return;
      var group = [i];
      for (var j = i + 1; j < locations.length; j++) {
        if (seen[j]) continue;
        var dLat = loc.lat - locations[j].lat;
        var dLng = (loc.lng - locations[j].lng) * Math.cos(loc.lat * Math.PI / 180);
        if (Math.hypot(dLat, dLng) < MERGE_DEG) group.push(j);
      }
      group.forEach(function (k) { seen[k] = true; });
      if (group.length < 2) return;
      var cLat = group.reduce(function (s, k) { return s + locations[k].lat; }, 0) / group.length;
      var cLng = group.reduce(function (s, k) { return s + locations[k].lng; }, 0) / group.length;
      group.forEach(function (k, gi) {
        var ang = (gi / group.length) * Math.PI * 2;
        locations[k].nudge = [
          (cLat - locations[k].lat) + Math.sin(ang) * SPREAD_DEG,
          (cLng - locations[k].lng) + Math.cos(ang) * SPREAD_DEG / Math.cos(cLat * Math.PI / 180)
        ];
      });
    });
  })();

  var pinGroup = new THREE.Group();
  var routeGroup = new THREE.Group();
  root.add(routeGroup);
  root.add(pinGroup);
  var pinTargets = [];

  function addPin(loc) {
    var current = loc.type === 'current';
    var surface = latLngToVec3(pinLat(loc), pinLng(loc), RADIUS * 1.018);
    var top = latLngToVec3(pinLat(loc), pinLng(loc), RADIUS * (current ? 1.12 : 1.075));
    loc.surface = top.clone();

    var pin = new THREE.Group();
    pin.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([surface, top]),
      new THREE.LineBasicMaterial({
        color: current ? 0xff1a1a : 0x8b0000,
        transparent: true,
        opacity: current ? 0.9 : 0.5,
        depthWrite: false
      })
    ));

    var dot = new THREE.Mesh(
      new THREE.SphereGeometry(current ? 0.027 : 0.019, 14, 14),
      new THREE.MeshBasicMaterial({ color: current ? 0xff1a1a : 0xb01010, transparent: true, opacity: 0.96 })
    );
    dot.position.copy(top);
    pin.add(dot);

    var halo = new THREE.Mesh(
      new THREE.RingGeometry(current ? 0.043 : 0.03, current ? 0.058 : 0.04, 28),
      new THREE.MeshBasicMaterial({
        color: current ? 0xfff2f2 : 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: current ? 0.44 : 0.24,
        depthWrite: false
      })
    );
    halo.position.copy(top);
    halo.lookAt(0, 0, 0);
    pin.add(halo);

    var hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
    );
    hit.position.copy(top);
    hit.userData.location = loc;
    pin.add(hit);
    pinTargets.push(hit);
    pinGroup.add(pin);

    if (labelLayer) {
      var label = document.createElement('div');
      label.className = 'map-label' + (current ? ' current' : '');
      label.appendChild(document.createTextNode(loc.name));
      var small = document.createElement('small');
      small.textContent = loc.region;
      label.appendChild(small);
      labelLayer.appendChild(label);
      loc.labelEl = label;
    }
  }

  function makeArc(start, end, index) {
    var a = latLngToVec3(pinLat(start), pinLng(start), 1).normalize();
    var b = latLngToVec3(pinLat(end), pinLng(end), 1).normalize();
    var total = Math.max(a.angleTo(b), 0.001);
    var sinTotal = Math.sin(total);
    var points = [];
    var segments = 72;
    for (var i = 0; i <= segments; i++) {
      var t = i / segments;
      points.push(new THREE.Vector3()
        .addScaledVector(a, Math.sin((1 - t) * total) / sinTotal)
        .addScaledVector(b, Math.sin(t * total) / sinTotal)
        .normalize()
        .multiplyScalar(1.04 + Math.sin(Math.PI * t) * 0.22));
    }
    var line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0xb01010,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      })
    );
    line.userData.phase = index * 0.45;
    routeGroup.add(line);
    return line;
  }

  locations.forEach(addPin);

  // Decorative arcs between neighbouring stops. They are not exact routes or
  // dates, and the page says so.
  var routeIds = [
    'middletown', 'tampa', 'clearwater', 'cincinnati', 'waukegan', 'sacramento',
    'carlsbad', 'oceanside', 'tijuana', 'middletown', 'boca-raton', 'fort-lauderdale',
    'cape-coral', 'ocala', 'dallas', 'austin', 'jacksonville', 'st-pete', 'clearwater',
    'pensacola', 'charleston', 'jacksonville', 'norfolk', 'portsmouth', 'virginia-beach',
    'middletown', 'cairo', 'giza', 'alexandria', 'dubai', 'alexandria', 'pendik',
    'istanbul', 'alexandria'
  ];
  var routeLines = [];
  routeIds.forEach(function (id, index) {
    var start = locationById[id];
    var end = locationById[routeIds[index + 1]];
    if (start && end) routeLines.push(makeArc(start, end, index));
  });

  // ---- Panel, selection, list buttons ---------------------------------------

  var home = locationById['alexandria'] || locations[0];
  var selected = home;

  var placesMetric = document.getElementById('map-metric-places');
  var countriesMetric = document.getElementById('map-metric-countries');
  if (placesMetric) placesMetric.textContent = String(locations.length);
  if (countriesMetric) countriesMetric.textContent = String(Object.keys(countries).length);

  function showInPanel(loc) {
    if (activePlace) activePlace.textContent = loc.name + ', ' + loc.region;
    if (activeMeta) activeMeta.textContent = describe(loc);
  }
  showInPanel(selected);

  locations.forEach(function (loc) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = loc.li.textContent;
    loc.li.textContent = '';
    loc.li.appendChild(btn);
    loc.btn = btn;
    btn.addEventListener('click', function () { selectPlace(loc); });
  });

  function setPaused(value) {
    paused = value;
    if (toggleBtn) toggleBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    dirty = true;
  }

  function selectPlace(loc) {
    selected = loc;
    showInPanel(loc);
    locations.forEach(function (l) { l.btn.setAttribute('aria-pressed', l === loc ? 'true' : 'false'); });
    if (statusEl) statusEl.textContent = loc.name + ', ' + loc.region + '. ' + describe(loc);
    // Hold the place in front instead of spinning it away.
    setPaused(true);
    faceLocation(loc);
  }

  // Rotation that brings a pin to the center of the view. The group uses
  // Euler order XYZ, so a point v lands at Rx(rx) * Ry(ry) * v.
  function facing(loc, tilt) {
    var v = latLngToVec3(pinLat(loc), pinLng(loc), 1);
    var horizontal = Math.sqrt(v.x * v.x + v.z * v.z);
    return {
      x: Math.max(-0.8, Math.min(0.8, Math.atan2(v.y, horizontal) * tilt)),
      y: Math.atan2(-v.x, v.z)
    };
  }
  function faceLocation(loc) {
    var f = facing(loc, 1);
    rotateTo(f.x, f.y);
  }

  // Start (and reset) facing the current home, with a gentler tilt.
  var homeView = facing(home, 0.5);
  INITIAL.x = homeView.x;
  INITIAL.y = homeView.y;
  root.rotation.set(INITIAL.x, INITIAL.y, 0);

  var tween = null;
  function rotateTo(x, y) {
    var delta = y - root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    vel.x = 0;
    vel.y = 0;
    if (motion.matches) {
      root.rotation.x = x;
      root.rotation.y += delta;
      tween = null;
      dirty = true;
      return;
    }
    tween = { fromX: root.rotation.x, fromY: root.rotation.y, toX: x, toY: root.rotation.y + delta, t0: performance.now(), dur: 700 };
  }

  // ---- Controls -----------------------------------------------------------

  var paused = false;
  var focused = false;
  var dragging = false;
  var vel = { x: 0, y: 0 };
  var AUTO_SPEED = 0.004; // radians per frame at 60fps

  function ambient() { return !paused && !focused && !motion.matches; }

  function syncMotionUI() {
    if (toggleBtn) toggleBtn.hidden = motion.matches;
    dirty = true;
  }
  syncMotionUI();
  if (motion.addEventListener) motion.addEventListener('change', syncMotionUI);
  else if (motion.addListener) motion.addListener(syncMotionUI);

  if (controls) controls.hidden = false;
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () { setPaused(!paused); });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      selected = home;
      showInPanel(home);
      locations.forEach(function (l) { l.btn.setAttribute('aria-pressed', 'false'); });
      if (statusEl) statusEl.textContent = 'View reset.';
      rotateTo(INITIAL.x, INITIAL.y);
      dirty = true;
    });
  }

  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();
  function pinAt(event) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(pinTargets, false);
    return hits.length ? hits[0].object.userData.location : null;
  }

  var prev = { x: 0, y: 0 };
  var downAt = null;
  var SPIN = 0.0052;

  function clampTilt() {
    root.rotation.x = Math.max(-0.8, Math.min(0.8, root.rotation.x));
  }

  canvas.addEventListener('pointerdown', function (e) {
    dragging = true;
    tween = null;
    prev = { x: e.clientX, y: e.clientY };
    downAt = { x: e.clientX, y: e.clientY };
    vel.x = 0;
    vel.y = 0;
    canvas.classList.add('dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not critical */ }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) {
      var hovered = pinAt(e);
      canvas.classList.toggle('over-pin', !!hovered);
      showInPanel(hovered || selected);
      return;
    }
    var dx = e.clientX - prev.x;
    var dy = e.clientY - prev.y;
    prev = { x: e.clientX, y: e.clientY };
    root.rotation.y += dx * SPIN;
    root.rotation.x += dy * SPIN;
    clampTilt();
    vel.y = dx * SPIN;
    vel.x = dy * SPIN;
    dirty = true;
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('dragging');
    // A tap or click with almost no movement picks the pin under it.
    if (e && e.type === 'pointerup' && downAt &&
        Math.abs(e.clientX - downAt.x) < 5 && Math.abs(e.clientY - downAt.y) < 5) {
      var tapped = pinAt(e);
      if (tapped) selectPlace(tapped);
    }
    if (motion.matches) { vel.x = 0; vel.y = 0; }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', function () {
    canvas.classList.remove('over-pin');
    if (!dragging) showInPanel(selected);
  });

  // Keyboard: arrow keys turn the globe while it has focus.
  var KEY_STEP = 0.14;
  canvas.addEventListener('focus', function () { focused = true; });
  canvas.addEventListener('blur', function () { focused = false; });
  canvas.addEventListener('keydown', function (e) {
    var handled = true;
    if (e.key === 'ArrowLeft') root.rotation.y += KEY_STEP;
    else if (e.key === 'ArrowRight') root.rotation.y -= KEY_STEP;
    else if (e.key === 'ArrowUp') root.rotation.x += KEY_STEP;
    else if (e.key === 'ArrowDown') root.rotation.x -= KEY_STEP;
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    tween = null;
    vel.x = 0;
    vel.y = 0;
    clampTilt();
    dirty = true;
  });

  // ---- Labels ---------------------------------------------------------------

  // The selected place gets first claim on space, then the rest in list order.
  function labelOrder() {
    return [selected].concat(locations.filter(function (l) { return l !== selected; }));
  }

  function updateLabels() {
    if (!labelLayer) return;
    var rect = canvas.getBoundingClientRect();
    var panelRect = panel && getComputedStyle(panel).position === 'absolute'
      ? panel.getBoundingClientRect() : null;
    var placed = [];
    labelOrder().forEach(function (loc) {
      if (!loc.labelEl || !loc.surface) return;
      var wanted = loc.label || loc === selected;
      var world = loc.surface.clone().applyEuler(root.rotation);
      var p = world.clone().project(camera);
      var facing = world.z > -0.05 && Math.abs(p.x) < 1.08 && Math.abs(p.y) < 1.08;
      if (!wanted || !facing) {
        loc.labelEl.classList.remove('visible');
        return;
      }
      var x = canvas.offsetLeft + (p.x * 0.5 + 0.5) * rect.width;
      var y = canvas.offsetTop + (-p.y * 0.5 + 0.5) * rect.height;
      var underPanel = false;
      if (panelRect && loc !== selected) {
        var cx = rect.left + (p.x * 0.5 + 0.5) * rect.width;
        var cy = rect.top + (-p.y * 0.5 + 0.5) * rect.height;
        underPanel = cx > panelRect.left - 24 && cx < panelRect.right + 24 &&
                     cy > panelRect.top - 24 && cy < panelRect.bottom + 24;
      }
      // Skip a label that would sit on top of one already shown.
      var w = loc.labelEl.offsetWidth;
      var h = loc.labelEl.offsetHeight;
      var box = { l: x - w / 2 - 4, r: x + w / 2 + 4, t: y - h * 1.5 - 4, b: y - h * 0.5 + 4 };
      var collides = placed.some(function (o) {
        return box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t;
      });
      var show = !underPanel && !collides;
      if (show) placed.push(box);
      loc.labelEl.classList.toggle('visible', show);
      loc.labelEl.classList.toggle('current', loc.type === 'current' || loc === selected);
      loc.labelEl.style.left = x.toFixed(1) + 'px';
      loc.labelEl.style.top = y.toFixed(1) + 'px';
    });
  }

  // ---- Render loop ------------------------------------------------------------

  if ('ResizeObserver' in window) new ResizeObserver(setSize).observe(stage);
  else window.addEventListener('resize', setSize);

  var visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) dirty = true;
    }, { threshold: 0 }).observe(canvas);
  }

  var lastTime = 0;
  var routeTime = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;

    var dt = Math.min((now - lastTime) / 16.67, 3);
    lastTime = now;
    var moving = false;

    if (tween) {
      var t = Math.max(0, Math.min((now - tween.t0) / tween.dur, 1));
      var e = 1 - Math.pow(1 - t, 3);
      root.rotation.x = tween.fromX + (tween.toX - tween.fromX) * e;
      root.rotation.y = tween.fromY + (tween.toY - tween.fromY) * e;
      if (t >= 1) tween = null;
      moving = true;
    } else if (!dragging && !motion.matches) {
      // Coast after a drag, then settle at the slow turn (or at rest if paused).
      var targetVy = ambient() ? AUTO_SPEED : 0;
      vel.y += (targetVy - vel.y) * Math.min(0.06 * dt, 1);
      vel.x *= Math.pow(0.92, dt);
      if (Math.abs(vel.x) < 0.00002) vel.x = 0;
      if (Math.abs(vel.y) < 0.00002) vel.y = 0;
      if (vel.x !== 0 || vel.y !== 0) {
        root.rotation.y += vel.y * dt;
        root.rotation.x += vel.x * dt;
        clampTilt();
        moving = true;
      }
    }

    var pulsing = ambient();
    if (pulsing) {
      routeTime += 0.018 * dt;
      routeLines.forEach(function (line) {
        line.material.opacity = 0.24 + 0.24 * Math.max(0, Math.sin(routeTime - line.userData.phase));
      });
    } else if (dirty) {
      routeLines.forEach(function (line) { line.material.opacity = 0.34; });
    }

    if (moving || pulsing || dirty) {
      updateLabels();
      renderer.render(scene, camera);
      dirty = false;
    }
  }
  requestAnimationFrame(frame);
})();
