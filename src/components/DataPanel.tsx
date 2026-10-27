import { useEffect, useRef, useState } from 'react';
import { Database, Download, Upload, X, CheckCircle2, AlertTriangle, Smartphone } from 'lucide-react';
import { promptInstall, useInstallState } from '../lib/install';
import type { MetaState } from '../lib/meta';
import { coverage, formatMetaDate } from '../lib/meta';
import type { ImportSummary } from '../lib/visits';
import { fetchWorkerHealth, RATINGS_API, type WorkerHealth } from '../lib/worker';

interface Props {
  open: boolean;
  onClose: () => void;
  meta: MetaState;
  visitCount: number;
  onExport: () => void;
  onImport: (text: string) => ImportSummary;
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('방문기록 파일을 읽지 못했습니다.'));
    reader.readAsText(file);
  });
}


type Notice = { kind: 'ok' | 'error'; text: string } | null;

const IS_IOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

function InstallSection() {
  const state = useInstallState();
  const [declined, setDeclined] = useState(false);

  return (
    <section className="pt-4 border-t border-line-subtle" aria-labelledby="install-title">
      <h3 id="install-title" className="m-0 flex items-center gap-1.5 text-sm font-bold">
        <Smartphone className="w-4 h-4" aria-hidden="true" />앱으로 설치
      </h3>
      {state === 'standalone' && <p className="m-0 mt-1 text-xs text-fg-muted">지금 설치한 앱으로 열려 있습니다.</p>}
      {state === 'installed' && <p className="m-0 mt-1 text-xs text-fg-muted" role="status">설치했습니다. 홈 화면의 맛핀 아이콘으로 여세요.</p>}
      {state === 'ready' && (
        <>
          <p className="m-0 mt-1 text-xs text-fg-muted">홈 화면에 아이콘이 생기고 주소창 없이 앱처럼 열립니다.</p>
          <button
            type="button"
            onClick={() => { void promptInstall().then((outcome) => setDeclined(outcome === 'dismissed')); }}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:bg-primary-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Download className="w-4 h-4" aria-hidden="true" />홈 화면에 설치
          </button>
        </>
      )}
      {state === 'unavailable' && (
        <p className="m-0 mt-1 text-xs text-fg-muted">
          {IS_IOS
            ? '사파리 아래쪽 공유 버튼 › 홈 화면에 추가를 누르세요.'
            : declined
              ? '설치를 취소했습니다. 페이지를 새로 고치면 다시 설치할 수 있습니다.'
              : '이 브라우저가 아직 설치를 허락하지 않았습니다. 화면을 한 번 누르고 몇 초 뒤 다시 열어 보세요. 그래도 안 되면 원인을 점검합니다.'}
        </p>
      )}
      {state === 'unavailable' && !IS_IOS && (
        <a
          href={`${import.meta.env.BASE_URL}install.html`}
          className="mt-3 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-surface border border-line text-sm font-semibold hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          설치 점검하기
        </a>
      )}
    </section>
  );
}

export function DataPanel({ open, onClose, meta, visitCount, onExport, onImport }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [health, setHealth] = useState<WorkerHealth | 'loading' | 'error'>(RATINGS_API ? 'loading' : 'error');

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !RATINGS_API) return;
    let alive = true;
    setHealth('loading');
    void fetchWorkerHealth()
      .then((value) => { if (alive) setHealth(value); })
      .catch(() => { if (alive) setHealth('error'); });
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const summary = onImport(await readTextFile(file));
      setNotice({
        kind: 'ok',
        text: `복원 완료 · 새 기록 ${summary.imported}개 · 갱신 ${summary.updated}개 · 유지 ${summary.kept}개`,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '방문기록을 복원하지 못했습니다.' });
    }
  };

  const data = meta.status === 'ready' ? meta.data : null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 grid place-items-center p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-panel-title"
        className="w-full max-w-md max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-surface text-fg border border-line shadow-2xl"
      >
        <header className="sticky top-0 z-10 bg-surface flex items-center justify-between gap-3 px-4 py-3 border-b border-line-subtle">
          <h2 id="data-panel-title" className="m-0 flex items-center gap-2 text-base font-bold">
            <Database className="w-5 h-5 text-primary-fg" aria-hidden="true" />
            데이터와 내 기록
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="데이터 패널 닫기"
            className="grid place-items-center w-11 h-11 -my-2 -mr-2 rounded-lg text-fg-muted hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-4 grid gap-4">
          <section aria-labelledby="data-status-title">
            <h3 id="data-status-title" className="m-0 mb-2 text-sm font-bold">데이터 상태</h3>
            {meta.status === 'loading' && <p className="m-0 text-sm text-fg-muted" role="status">정보를 불러오는 중입니다.</p>}
            {meta.status === 'error' && (
              <p className="m-0 text-sm text-[var(--matpin-closing)]" role="status">
                메타데이터를 불러오지 못했습니다. 목록과 지도는 그대로 사용할 수 있습니다.
              </p>
            )}
            {data && (
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
                <dt className="text-fg-muted">생성 기준</dt><dd className="m-0 font-medium">{formatMetaDate(data.generatedAt)}</dd>
                <dt className="text-fg-muted">즐겨찾기</dt><dd className="m-0 tabular-nums">{data.places.total.toLocaleString()}곳</dd>
                <dt className="text-fg-muted">네이버 평점 정보</dt><dd className="m-0 tabular-nums">{coverage(data.ratings.withNaver, data.places.total)}</dd>
                <dt className="text-fg-muted">카카오 평점 정보</dt><dd className="m-0 tabular-nums">{coverage(data.ratings.withKakao, data.places.total)}</dd>
                <dt className="text-fg-muted">구글 장소 연결</dt><dd className="m-0 tabular-nums">{coverage(data.places.withGoogleId, data.places.total)}</dd>
                <dt className="text-fg-muted">영업시간</dt><dd className="m-0 tabular-nums">{coverage(data.ratings.withHours, data.places.total)}</dd>
                <dt className="text-fg-muted">메뉴</dt><dd className="m-0 tabular-nums">{coverage(data.ratings.withMenus, data.places.total)}</dd>
              </dl>
            )}
            <p className="m-0 mt-3 flex items-center gap-1.5 text-xs text-fg-muted" role="status">
              {health === 'loading' ? '평점 Worker 확인 중' : health === 'error' ? (
                <><AlertTriangle className="w-3.5 h-3.5 text-[var(--matpin-closing)]" aria-hidden="true" />평점 Worker 연결 안 됨</>
              ) : (
                <><CheckCircle2 className="w-3.5 h-3.5 text-[var(--matpin-open)]" aria-hidden="true" />평점 Worker 연결됨 · Google {health.google ? '사용 가능' : '키 없음'} · {health.builtAt}</>
              )}
            </p>
          </section>

          <section className="pt-4 border-t border-line-subtle" aria-labelledby="backup-title">
            <h3 id="backup-title" className="m-0 text-sm font-bold">방문기록 백업</h3>
            <p className="m-0 mt-1 text-xs text-fg-muted">
              이 브라우저에 {visitCount.toLocaleString()}개 기록이 있습니다. 가져오기는 기존 기록과 합치며 더 최신인 방문 시각을 우선합니다.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { onExport(); setNotice({ kind: 'ok', text: '방문기록 파일을 저장했습니다.' }); }}
                className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-surface border border-line text-sm font-semibold hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Download className="w-4 h-4" aria-hidden="true" />내보내기
              </button>
              <label className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-primary text-on-primary text-sm font-semibold cursor-pointer hover:bg-primary-pressed focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
                <Upload className="w-4 h-4" aria-hidden="true" />가져오기
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }}
                />
              </label>
            </div>
            {notice && (
              <p
                className={`m-0 mt-3 text-xs ${notice.kind === 'ok' ? 'text-fg-muted' : 'text-[var(--matpin-closing)]'}`}
                role="status"
              >
                {notice.text}
              </p>
            )}
          </section>

          <InstallSection />
        </div>
      </section>
    </div>
  );
}
