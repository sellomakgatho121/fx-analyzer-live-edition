'use client';

import { useEffect, useRef } from 'react';

const EXTENSION_ATTRS = ['bis_skin_checked', 'bis_register', '__processed'];

export default function HydrationSanitizer() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const clean = () => {
      for (const attr of EXTENSION_ATTRS) {
        document.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));
      }
    };

    // Run after React hydration completes
    requestAnimationFrame(() => {
      clean();
      const mo = new MutationObserver(clean);
      mo.observe(document.body || document.documentElement, { attributes: true, subtree: true });
    });
  }, []);

  return null;
}
