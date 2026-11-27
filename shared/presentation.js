// Milestone 1.5 Presentation Setup: Lenis smooth scroll & GSAP micro-animations
document.addEventListener('DOMContentLoaded', () => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduced && typeof Lenis !== 'undefined') {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      smooth: true
    });
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  if (!prefersReduced && typeof gsap !== 'undefined') {
    gsap.from('.hero-copy > *, .search-panel, .form-card, .panel, .stats > div', {
      opacity: 0,
      y: 18,
      duration: 0.6,
      stagger: 0.08,
      ease: 'power2.out',
      clearProps: 'all'
    });
  }
});
