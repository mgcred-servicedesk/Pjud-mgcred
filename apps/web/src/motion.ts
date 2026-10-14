import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const supportsViewTransitions = () => typeof document.startViewTransition === 'function';

// Tipo da transição: define quais áreas animam (ver motion.css, html[data-vt=...]).
export type TransitionKind = 'page' | 'filter' | 'auth';

// Aplica uma mudança de estado com View Transition quando disponível.
export function withViewTransition(update: () => void, kind: TransitionKind = 'page') {
  if (!supportsViewTransitions() || prefersReducedMotion() || document.hidden) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = kind;
  const transition = document.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => { if (root.dataset.vt === kind) delete root.dataset.vt; });
}

// Número que "conta" até o novo valor (indicadores).
export function useAnimatedNumber(value: number, duration = 600) {
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return; }
    const start = performance.now();
    const initial = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(initial + (value - initial) * eased);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}
