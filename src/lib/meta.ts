export interface DataMeta {
  version: 1;
  generatedAt: string;
  places: {
    total: number;
    withKakaoId: number;
    withGoogleId: number;
  };
  ratings: {
    total: number;
    withNaver: number;
    withKakao: number;
    withGoogle: number;
    withHours: number;
    withMenus: number;
  };
}

export type MetaState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: DataMeta }
  | { status: 'error'; data: null };

export function formatMetaDate(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '기준일 알 수 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(time));
}

export function coverage(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}
