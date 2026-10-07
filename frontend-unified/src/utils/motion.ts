/** 'auto' (a jump) for someone who asked their system for reduced motion, otherwise 'smooth' */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
