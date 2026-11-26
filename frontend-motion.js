/* ZAROORAT visual foundation: optional presentation-only motion. */
(() => {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const start = () => {
    const gsap = window.gsap;
    if (gsap) {
      gsap.from('.site-header, .topbar', { duration: 0.55, y: -14, opacity: 0, ease: 'power2.out', clearProps: 'transform,opacity' });
      gsap.from('.hero-copy, .auth-card, .card, .form-card', { duration: 0.5, y: 12, opacity: 0, stagger: 0.06, ease: 'power2.out', clearProps: 'transform,opacity' });
    }

    const Lenis = window.Lenis;
    if (Lenis) {
      const lenis = new Lenis({ duration: 1.05, smoothWheel: true, syncTouch: false });
      const raf = time => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
