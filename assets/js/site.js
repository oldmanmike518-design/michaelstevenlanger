/* Shared behavior for every page. Loaded in the head, without defer, so the
   "js" class is on <html> before first paint. Content is never hidden unless
   this script is running. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Old single page links (#story, #map, #now, #services) still land somewhere
  // sensible. #hero, #work, #about and #contact exist on the home page.
  (function redirectLegacyHashes() {
    var legacy = {
      '#story': '/about/',
      '#now': '/about/',
      '#map': '/about/#map',
      '#services': '/work/'
    };
    var path = location.pathname.replace(/index\.html$/, '');
    if (path === '/' && legacy[location.hash]) {
      location.replace(legacy[location.hash]);
    }
  })();

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    // Header turns solid once the page scrolls.
    var header = document.querySelector('.site-header');
    if (header) {
      var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 40); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    // Footer year
    var year = document.getElementById('footer-year');
    if (year) year.textContent = new Date().getFullYear();

    // Email is assembled at runtime to keep it away from simple scrapers.
    var mail = document.getElementById('contact-email-link');
    if (mail) {
      var user = 'michael';
      var host = 'mikeslanger.com';
      mail.href = 'mailto:' + user + '@' + host;
      mail.textContent = '';
      mail.appendChild(document.createTextNode(user + '@mike'));
      var s = document.createElement('span');
      s.className = 'email-s';
      s.textContent = 's';
      mail.appendChild(s);
      mail.appendChild(document.createTextNode('langer.com'));
      mail.hidden = false;
      var fallback = document.getElementById('contact-email-fallback');
      if (fallback) fallback.hidden = true;
    }

    // Scroll fade in
    var items = document.querySelectorAll('.fade-in');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.1 });
      items.forEach(function (el) { io.observe(el); });
    } else {
      items.forEach(function (el) { el.classList.add('visible'); });
    }

    initCursorTrail();
  });

  // Decorative red trail that follows the mouse. Skipped on touch screens and
  // when reduced motion is on, and it does not draw over the home page hero.
  function initCursorTrail() {
    if (window.matchMedia('(pointer: coarse)').matches || reducedMotion.matches) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'cursor-trail';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    var tc = canvas.getContext('2d');
    if (!tc) { canvas.remove(); return; }

    var hero = document.getElementById('hero');
    var points = [];
    var running = false;
    var last = 0;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    document.addEventListener('mousemove', function (e) {
      if (reducedMotion.matches) return;
      if (hero && e.clientY < hero.getBoundingClientRect().bottom) return;
      points.push({ x: e.clientX, y: e.clientY, life: 1 });
      if (!running) {
        running = true;
        last = performance.now();
        requestAnimationFrame(draw);
      }
    });

    function draw(now) {
      var dt = Math.min((now - last) / 16.67, 3);
      last = now;
      tc.clearRect(0, 0, canvas.width, canvas.height);

      for (var i = points.length - 1; i >= 0; i--) {
        points[i].life -= 0.04 * dt;
        if (points[i].life <= 0) points.splice(i, 1);
      }
      if (points.length < 2) {
        if (!points.length) { running = false; return; }
        requestAnimationFrame(draw);
        return;
      }

      for (var j = 1; j < points.length; j++) {
        var p0 = points[j - 1];
        var p1 = points[j];
        tc.beginPath();
        tc.moveTo(p0.x, p0.y);
        tc.lineTo(p1.x, p1.y);
        tc.strokeStyle = 'rgba(150, 0, 0, ' + (p1.life * 0.5) + ')';
        tc.lineWidth = p1.life * 4;
        tc.lineCap = 'round';
        tc.lineJoin = 'round';
        tc.stroke();
      }

      var tip = points[points.length - 1];
      var g = tc.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 14);
      g.addColorStop(0, 'rgba(180, 0, 0, ' + (tip.life * 0.35) + ')');
      g.addColorStop(1, 'rgba(180, 0, 0, 0)');
      tc.beginPath();
      tc.arc(tip.x, tip.y, 14, 0, Math.PI * 2);
      tc.fillStyle = g;
      tc.fill();

      requestAnimationFrame(draw);
    }
  }
})();
