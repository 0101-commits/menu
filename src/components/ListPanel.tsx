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
//
// 2026-09 개편
//   손잡이 44px + 헤더 64px = 108px 이 고정 UI 였다. 390×844 실측에서 half 스냅의
//   목록 본문이 111px 밖에 안 남아 카드(173px) 한 장도 못 들어갔다.
//   둘을 한 줄로 합쳐 56px 로 줄이고, 그 줄 전체가 드래그 손잡이가 된다 —
//   잡을 곳이 44px 막대 하나뿐이라 사람들이 목록 본문을 당기다 새로고침을 시켰다.

import { useEffect, useRef, useState } from 'react';

export type Snap = 'peek' | 'half' | 'full';

/** 스냅별 시트 높이. 숫자는 px 또는 뷰포트 높이 비율이다. */
const PEEK_PX = 96;
const HALF_RATIO = 0.66;
const FULL_RATIO = 0.92;

const HEIGHT: Record<Snap, string> = {
  peek: `${PEEK_PX}px`,
  half: `${HALF_RATIO * 100}svh`,
  full: `${FULL_RATIO * 100}svh`,
};

/**
 * 시트가 지금 화면 아래쪽 몇 px 를 덮고 있는지.
 * 지도가 마커를 "보이는 영역" 한가운데에 놓으려면 이 값이 필요하다.
 */
export function sheetInset(snap: Snap, viewportH: number): number {
  if (snap === 'peek') return PEEK_PX;
  return viewportH * (snap === 'half' ? HALF_RATIO : FULL_RATIO);
}

interface Props {
  snap: Snap;
  onSnapChange: (s: Snap) => void;
  desktop: boolean;
  /** 손잡이 줄 안에 함께 서는 제목 영역. 그 줄 전체가 드래그 손잡이다. */
  title?: React.ReactNode;
  children: React.ReactNode;
}

const ORDER: Snap[] = ['peek', 'half', 'full'];

export function ListPanel({ snap, onSnapChange, desktop, title, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<{ startY: number; startH: number; h: number } | null>(null);

  // 드래그 effect 는 snap 을 deps 에 넣지 않는다(끌던 중에 리스너가 갈리면 놓친다).
  // 탭으로 단계를 돌릴 때 필요한 "지금 단계" 는 ref 로 읽는다.
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // 드래그 중에는 높이를 직접 잡고, 놓으면 가장 가까운 단계로 붙인다.
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const h = Math.min(window.innerHeight * FULL_RATIO, Math.max(64, drag.startH - (e.clientY - drag.startY)));
      setDrag((d) => (d ? { ...d, h } : d));
    };
    const up = (e: PointerEvent) => {
      // 놓는 순간의 좌표로 직접 판정한다. drag.h(상태)로 보면 마지막 pointermove 가
      // 아직 반영되기 전이라 빠른 플릭이 "안 움직였다" 로 읽힌다 — 실측으로 200px 을
      // 끌어 올린 제스처가 탭으로 처리돼 엉뚱한 단계로 갔다.
      const dy = e.clientY - drag.startY;

      // 거의 안 움직였으면 끌기가 아니라 탭이다. 손잡이 막대(16px)만 누르게 두면
      // 손가락으로 못 맞춘다 — 줄 전체가 탭 대상이 된다(버튼 자리는 위에서 제외했다).
      if (Math.abs(dy) < 4) {
        setDrag(null);
        onSnapChange(ORDER[(ORDER.indexOf(snapRef.current) + 1) % ORDER.length]);
        return;
      }
      const vh = window.innerHeight;
      const targets: [Snap, number][] = [
        ['peek', PEEK_PX],
        ['half', vh * HALF_RATIO],
        ['full', vh * FULL_RATIO],
      ];
      const current = Math.min(vh * FULL_RATIO, Math.max(64, drag.startH - dy));
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
        {title}
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
          // 이 줄 안에도 버튼이 선다. 버튼 위에서 시작한 눌림까지 드래그로 가로채면
          // 포인터 캡처가 클릭을 삼켜 버튼이 안 눌린다.
          if ((e.target as HTMLElement).closest('[data-nodrag]')) return;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          const h = ref.current?.getBoundingClientRect().height ?? 0;
          setDrag({ startY: e.clientY, startH: h, h });
        }}
      >
        {/* 키보드·보조기술용 컨트롤. 포인터로는 이 줄 어디를 눌러도 같은 일이 일어나므로
            (위 pointerup 의 탭 처리) 막대 자체는 작아도 된다. data-nodrag 로 두어야
            눌림이 드래그로 가로채여 클릭이 삼켜지는 일이 없다. */}
        <button
          type="button"
          data-nodrag
          onClick={cycle}
          aria-label={`목록 크기 바꾸기 (현재 ${snap === 'peek' ? '접힘' : snap === 'half' ? '절반' : '전체'})`}
          className="w-full grid place-items-center h-4 pt-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
        >
          <span aria-hidden="true" className="block w-10 h-1 rounded-full bg-line-strong" />
        </button>
        {title}
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
