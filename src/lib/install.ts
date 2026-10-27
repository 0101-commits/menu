import { useSyncExternalStore } from 'react';

// 크롬·삼성 인터넷은 설치 조건이 맞으면 beforeinstallprompt 를 한 번 보낸다.
// 이 이벤트를 잡아 두면 브라우저 메뉴를 찾지 않아도 앱 안 버튼으로 설치 창을 띄울 수 있다.
// 이벤트는 페이지가 뜨자마자 올 수 있어서 React 가 그리기 전에(main.tsx 첫 줄) 듣기 시작한다.
// 아이폰 사파리에는 이 이벤트가 없다 — 공유 › 홈 화면에 추가로만 설치된다.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'standalone' | 'ready' | 'installed' | 'unavailable';

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function listenForInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  // 번들이 늦게 뜨는 사이에 온 이벤트는 index.html 머리의 짧은 스크립트가 붙잡아 둔다.
  const early = (window as Window & { __matpinInstall?: Event }).__matpinInstall;
  if (early) deferred = early as InstallPromptEvent;
  window.addEventListener('beforeinstallprompt', (event) => {
    // 기본 동작(크롬의 하단 미니 안내줄)을 막고 앱 버튼으로만 띄운다.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    justInstalled = true;
    notify();
  });
}

function snapshot(): InstallState {
  if (isStandalone()) return 'standalone';
  if (justInstalled) return 'installed';
  return deferred ? 'ready' : 'unavailable';
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 설치 창을 띄운다. 이벤트는 한 번만 쓸 수 있어서 창을 띄운 뒤에는 결과와 상관없이 버린다. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  try {
    await event.prompt();
  } catch {
    // 사용자 동작 밖에서 불렸거나 이미 쓴 이벤트 — 버튼은 그대로 두고 조용히 끝낸다.
    return 'unavailable';
  }
  deferred = null;
  const { outcome } = await event.userChoice;
  // appinstalled 는 조금 늦게 온다. 그 사이 "설치 못 함" 안내가 번쩍이지 않게 먼저 표시한다.
  if (outcome === 'accepted') justInstalled = true;
  notify();
  return outcome;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => 'unavailable');
}
