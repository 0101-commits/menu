// 영업 상태 판정.
//
// 카카오 panel3 이 주는 영업시간은 "오늘부터 7일" 의 문자열 배열이다.
//   ["14:00 ~ 24:00", "", "11:30 ~ 22:00", ...]   빈 문자열 = 휴무
//
// 함정이 둘이다.
//
//   1) 그 "오늘" 은 보는 날이 아니라 **수집한 날**이다. 수집은 주 1회 1/4 씩 돌아
//      한 장소의 배열이 최대 4주 고정된다. 화요일에 받은 배열을 금요일에 그대로 읽으면
//      금요일에 화요일 영업시간을 적용한다 — 요일마다 다르거나 특정 요일 휴무인 가게에서
//      "영업 중"·"오늘 휴무" 가 통째로 틀린다. 그래서 수집 요일(hoursDay)을 같이 받아
//      며칠 어긋났는지 계산해 인덱스를 민다.
//
//   2) 24:00 을 넘기는 표기(예: "18:00 ~ 02:00")는 자정을 넘긴 영업이다. 그대로 다루면
//      새벽 1시에 "영업 종료" 로 잘못 나온다.

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
 * 배열에서 "보는 날" 에 해당하는 칸을 고른다.
 * hoursDay 를 모르면 예전처럼 0번을 쓴다 — 틀릴 수 있지만 아무것도 못 보여주는 것보다 낫다.
 */
export function todayIndex(hoursDay: number | undefined, now: Date): number {
  if (hoursDay == null) return 0;
  return (now.getDay() - hoursDay + 7) % 7;
}

/**
 * @param hours    카카오가 준 7일치 배열. 0번은 수집한 날이다.
 * @param now      판정 기준 시각
 * @param hoursDay hours[0] 의 요일(0=일). 없으면 0번을 오늘로 본다.
 */
export function openStatus(hours: string[] | undefined, now = new Date(), hoursDay?: number): OpenStatus {
  if (!hours?.length) return UNKNOWN;

  const idx = todayIndex(hoursDay, now);
  // 배열이 7칸보다 짧을 수 있다(카카오가 덜 주는 경우). 그러면 판정하지 않는다.
  if (idx >= hours.length) return UNKNOWN;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = hours[idx] ?? '';

  if (!today.trim()) return { state: 'dayoff', text: '오늘 휴무' };

  const t = parseRange(today);
  if (!t) return UNKNOWN;

  // 자정을 넘겨 여는 가게를 새벽에 보면, 지금 열려 있는 건 어젯밤에 시작한 영업이다.
  // 어제 칸을 따로 보지 않고 오늘의 마감 시각을 그대로 쓴다 — 요일마다 마감이 크게
  // 다르지 않고, 이게 없으면 새벽 1시에 "영업 종료" 로 보인다.
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
export function isOpenNow(hours: string[] | undefined, now = new Date(), hoursDay?: number): boolean {
  const s = openStatus(hours, now, hoursDay).state;
  return s === 'open' || s === 'closing-soon';
}
