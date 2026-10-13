import { useEffect, useRef, useState } from 'react';
import { sheetInset, useDesktop, type Snap } from '../components/ListPanel';

type ColorScheme = 'light' | 'dark';

function readColorScheme(): ColorScheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-seed-user-color-scheme') === 'dark' ? 'dark' : 'light';
}

export function useLayoutState() {
  const desktop = useDesktop();
  const [snap, setSnap] = useState<Snap>('half');
  const [viewportHeight, setViewportHeight] = useState(() => typeof window === 'undefined' ? 0 : window.innerHeight);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(readColorScheme);
  const chipBarRef = useRef<HTMLDivElement>(null);
  const [chipBarHeight, setChipBarHeight] = useState(48);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!desktop) { setChipBarHeight(0); return; }
    const element = chipBarRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setChipBarHeight(entry.contentRect.height));
    observer.observe(element);
    setChipBarHeight(element.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [desktop]);

  const toggleColorScheme = () => {
    const next: ColorScheme = colorScheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-seed-user-color-scheme', next);
    try { localStorage.setItem('matpin-color-scheme', next); } catch { /* 프라이빗 모드 */ }
    setColorScheme(next);
  };

  return {
    desktop, snap, setSnap,
    bottomInset: desktop ? 0 : sheetInset(snap, viewportHeight),
    colorScheme, toggleColorScheme, chipBarRef, chipBarHeight,
  };
}
