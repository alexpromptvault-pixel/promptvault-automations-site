/* ============================================================
   PROMPT VAULT AUTOMATIONS — interactions
   Techniques inspired by Animmaster Lib public preview:
   - Lenis-style smooth scroll (native + GSAP ScrollTrigger)
   - GSAP reveal & parallax
   - Magnetic button effect
   - Pointer-follow card spotlight + tilt
   - Hero canvas: connecting-dots particle field (react to cursor)
   ============================================================ */

(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.gsap) return;

  gsap.registerPlugin(ScrollTrigger);

  /* ---------------- HERO TEXT REVEAL ---------------- */
  const lines = document.querySelectorAll('.hero-title .line > span');
  lines.forEach((el, i) => {
    gsap.to(el, {
      yPercent: 0,
      duration: 1.1,
      ease: 'expo.out',
      delay: 0.15 + i * 0.08,
    });
    el.style.transform = 'translateY(110%)';
  });
  gsap.to('.hero .pill, .hero-sub, .cta-row, .trust, .scroll-hint', {
    opacity: 1, y: 0, duration: 1, ease: 'expo.out', delay: 0.7, stagger: 0.08,
  });
  gsap.set('.hero .pill, .hero-sub, .cta-row, .trust, .scroll-hint', { opacity: 0, y: 24 });

  /* ---------------- SCROLL REVEAL ---------------- */
  const reveals = document.querySelectorAll('.reveal');
  reveals.forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      onEnter: () => el.classList.add('in'),
      once: true,
    });
  });

  /* ---------------- CARD TILT + SPOTLIGHT ---------------- */
  const cards = document.querySelectorAll('[data-tilt]');
  cards.forEach((card) => {
    const max = 4;
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (x * 100) + '%');
      card.style.setProperty('--my', (y * 100) + '%');
      const rx = (0.5 - y) * max;
      const ry = (x - 0.5) * max;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(900px) rotateX(0) rotateY(0) translateY(0)';
    });
  });

  /* ---------------- MAGNETIC BUTTONS ---------------- */
  const magnets = document.querySelectorAll('[data-magnetic]');
  magnets.forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      gsap.to(el, { x: x * 0.25, y: y * 0.25, duration: 0.5, ease: 'power3.out' });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
    });
  });

  /* ---------------- SMOOTH SCROLL ANCHORS ---------------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      gsap.to(window, { duration: 1, scrollTo: { y: t, offsetY: 70 }, ease: 'expo.inOut' });
    });
  });

  /* ---------------- HERO CANVAS — particle field ---------------- */
  const canvas = document.getElementById('hero-canvas');
  if (canvas && !reduce) {
    const ctx = canvas.getContext('2d');
    let w, h, particles, mouse = { x: -9999, y: -9999 };
    const DENSITY = 0.00009;
    const MAX_DIST = 130;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      seed();
    };
    const seed = () => {
      const count = Math.floor(w * h * DENSITY);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.4 + 0.3,
      }));
    };
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(216, 166, 87, 0.6)';
        ctx.fill();
      }
      // connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MAX_DIST * MAX_DIST) {
            const alpha = (1 - Math.sqrt(d2) / MAX_DIST) * 0.18;
            ctx.strokeStyle = `rgba(216, 166, 87, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        // cursor interaction
        const dx = particles[i].x - mouse.x;
        const dy = particles[i].y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 14000) {
          const alpha = (1 - Math.sqrt(d2) / 120) * 0.4;
          ctx.strokeStyle = `rgba(232, 194, 129, ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    let raf = 0;

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('pointerleave', () => { mouse.x = -9999; mouse.y = -9999; });

    window.addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(tick);
  }

  /* ---------------- PARALLAX ON HERO TITLE ---------------- */
  if (!reduce) {
    gsap.to('.hero-title', {
      yPercent: -10,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero-bg', {
      yPercent: 25,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }
})();

/* ---------------- VISITOR BEACON ---------------- */
// Passive. No PII sent. IP and UA read server-side. Honors Do Not Track.
(function beacon() {
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  const isBot = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|preview|monitor/i.test(navigator.userAgent);
  if (isBot) return;
  let sid = null;
  try {
    const k = 'pva_sid';
    sid = sessionStorage.getItem(k);
    if (!sid) { sid = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()); sessionStorage.setItem(k, sid); }
  } catch (e) {}
  const send = (event) => {
    const body = JSON.stringify({
      event, sid,
      path: location.pathname,
      ref: document.referrer || null,
      href: location.href,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio || 1 },
      vp: { w: innerWidth, h: innerHeight },
      ua: navigator.userAgent
    });
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon('/.netlify/functions/visitor-tracker', new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
    fetch('/.netlify/functions/visitor-tracker', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
  };
  send('view');
  // Also beacon on hide (visibility change) so we catch engaged users
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send('hide'); });
})();
