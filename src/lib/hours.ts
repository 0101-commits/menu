// 영업 상태 판정.
//
// 카카오 panel3 이 주는 영업시간은 "오늘부터 7일" 의 문자열 배열이다.
//   ["14:00 ~ 24:00", "", "11:30 ~ 22:00", ...]   빈 문자열 = 휴무
// 수집 시점이 아니라 보는 시점을 기준으로 판정해야 하므로 계산은 여기서 한다.
//
// 24:00 을 넘기는 표기(예: "18:00 ~ 02:00")는 자정을 넘긴 영업이다. 그대로 다루면
// 새벽 1시에 "영업 종료" 로 잘못 나온다.

export type OpenState = 'open' | 'closing-soon' | 'closed' | 'dayoff' | 'unknown';

export interface OpenStatus {
  state: OpenState;
  /** "영업 중 · 21:00까지" 같은 한 줄 */
  text: string;
}

const UNKNOWN: OpenStatus = { state: 'unknown', text: '' };

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * @param hours 카카오가 준 7일치 배열. 0번이 오늘이다.
 * @param now   판정 기준 시각
 */
export function openStatus(hours: string[] | undefined, now = new Date()): OpenStatus {
  if (!hours?.length) return UNKNOWN;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = hours[0] ?? '';

  if (!today.trim()) return { state: 'dayoff', text: '오늘 휴무' };

  const t = parseRange(today);
  if (!t) return UNKNOWN;

  // 자정을 넘겨 여는 가게를 새벽에 보면, 지금 열려 있는 건 어젯밤에 시작한 영업이다.
  // 배열은 오늘부터 앞으로 7일이라 어제 값이 없다. 요일마다 영업시간이 크게 다르지 않으므로
  // 오늘의 마감 시각을 그대로 쓴다. 이게 없으면 새벽 1시에 "영업 종료" 로 보인다.
  if (t.overnight && nowMin < t.end) {
    return { state: t.end - nowMin <= 60 ? 'closing-soon' : 'open', text: statusText(nowMin, t.end) };
  }

  if (nowMin < t.start) return { state: 'closed', text: `${fmt(t.start)} 영업 시작` };

  const end = t.overnight ? t.end + 24 * 60 : t.end;
  if (nowMin >= end) return { state: 'closed', text: '영업 종료' };
  return { state: end - nowMin <= 60 ? 'closing-soon' : 'open', text: statusText(nowMin, t.end) };
}

function statusText(nowMin: number, endMin: number): string {
  const label = `${fmt(endMin)}까지`;
  const remain = endMin >= nowMin ? endMin - nowMin : endMin + 24 * 60 - nowMin;
  return remain <= 60 ? `곧 마감 · ${label}` : `영업 중 · ${label}`;
}

function fmt(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseRange(s: string): { start: number; end: number; overnight: boolean } | null {
  const m = s.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const start = toMinutes(m[1]);
  let end = toMinutes(m[2]);
  if (start == null || end == null) return null;
  // "14:00 ~ 24:00" 은 그날 자정. "18:00 ~ 02:00" 은 다음 날 새벽.
  if (end === 24 * 60) end = 24 * 60 - 1;
  const overnight = end < start;
  return { start, end, overnight };
}

/** 목록 필터용. "영업 중" 칩이 켜졌을 때 남길 것인지. */
export function isOpenNow(hours: string[] | undefined, now = new Date()): boolean {
  const s = openStatus(hours, now).state;
  return s === 'open' || s === 'closing-soon';
}
