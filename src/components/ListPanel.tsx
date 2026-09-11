// 목록을 담는 껍데기. 화면 폭에 따라 두 가지로 산다.
//
//   ≥1024px  지도 왼쪽에 서는 패널
//   <1024px  지도 위로 올라오는 바텀시트. 세 단계로 멈춘다.
//
// 바텀시트가 이 개편의 핵심이다. 예전에는 w-80 짜리 사이드바가 절대배치로 서 있어서
// 390px 화면에서 지도의 80% 를 덮었다. 목록을 보려면 지도를 포기해야 했다.
//
// SEED 의 BottomSheet 를 쓰지 않는다. 그건 모달이라 열려 있는 동안 뒤를 못 만진다.
// 여기서는 시트를 연 채로 지도를 움직일 수 있어야 한다.

import { useEffect, useRef, useState } from 'react';

export type Snap = 'peek' | 'half' | 'full';

const HEIGHT: Record<Snap, string> = {
  peek: '96px',
  half: '55svh',
  full: '92svh',
};

interface Props {
  snap: Snap;
  onSnapChange: (s: Snap) => void;
  desktop: boolean;
  children: React.ReactNode;
}

const ORDER: Snap[] = ['peek', 'half', 'full'];

export function ListPanel({ snap, onSnapChange, desktop, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<{ startY: number; startH: number; h: number } | null>(null);

  // 드래그 중에는 높이를 직접 잡고, 놓으면 가장 가까운 단계로 붙인다.
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const h = Math.min(window.innerHeight * 0.92, Math.max(64, drag.startH - (e.clientY - drag.startY)));
      setDrag((d) => (d ? { ...d, h } : d));
    };
    const up = () => {
      const vh = window.innerHeight;
      const targets: [Snap, number][] = [['peek', 96], ['half', vh * 0.55], ['full', vh * 0.92]];
      const current = drag.h;
      let best: Snap = 'half';
      let bestDist = Infinity;
      for (const [key, px] of targets) {
        const d = Math.abs(px - current);
        if (d < bestDist) { bestDist = d; best = key; }
      }
      setDrag(null);
      onSnapChange(best);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, onSnapChange]);

  if (desktop) {
    return (
      <aside className="absolute left-4 top-4 bottom-4 z-20 w-96 flex flex-col bg-surface shadow-2xl rounded-xl overflow-hidden">
        {children}
      </aside>
    );
  }

  const cycle = () => onSnapChange(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length]);

  return (
    <aside
      ref={ref}
      className="absolute left-0 right-0 bottom-0 z-20 flex flex-col bg-surface shadow-2xl rounded-t-2xl overflow-hidden"
      style={{
        height: drag ? `${drag.h}px` : HEIGHT[snap],
        transition: drag ? 'none' : 'height .22s cubic-bezier(.32,.72,0,1)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDrag({ startY: e.clientY, startH: ref.current?.getBoundingClientRect().height ?? 0, h: ref.current?.getBoundingClientRect().height ?? 0 });
        }}
      >
        <button
          type="button"
          onClick={cycle}
          aria-label={`목록 크기 바꾸기 (현재 ${snap === 'peek' ? '접힘' : snap === 'half' ? '절반' : '전체'})`}
          className="w-full grid place-items-center h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
        >
          <span aria-hidden="true" className="block w-10 h-1 rounded-full bg-line-strong" />
        </button>
      </div>
      {children}
    </aside>
  );
}

/** 1024px 이상인지. 레이아웃 분기를 한 곳에서만 판단한다. */
export function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}
