// 화면 상태를 URL 에 담는다.
//
// 예전에는 검색어·지역·선택한 가게가 전부 메모리에만 있어서 새로고침하면 사라지고
// 링크로 공유할 수도 없었다. 라우터 라이브러리를 넣을 만한 일이 아니라
// 파라미터 몇 개짜리 파서 하나로 끝낸다.
//
//   /?near=강남역&r=500&cat=일식,중식&sort=rating&open=1&min=4
//   /?place=1865051065
//   /?q=김밥

export type SortKey = 'distance' | 'rating' | 'reviews';

export interface AppState {
  /** 중심 장소 질의. "강남역" */
  near?: string;
  /**
   * 중심 좌표. near 와 함께 실어 두면 링크를 열 때 다시 지오코딩하지 않는다.
   * 같은 링크가 항상 같은 곳을 가리키고, 지도 SDK 가 늦거나 막혀도 범위가 복원된다.
   */
  ll?: { lat: number; lng: number };
  /** 반경(m) */
  r?: number;
  /** 대분류 필터 */
  cat?: string[];
  /** 자유 검색어 */
  q?: string;
  sort?: SortKey;
  /** 영업 중만 */
  open?: boolean;
  /** 최소 평점 */
  min?: number;
  /** 선택한 가게의 네이버 placeId */
  place?: string;
  /** 전체에서 검색(지도 범위 무시) */
  all?: boolean;
  /** 발견 모드 */
  discover?: boolean;
}

const SORTS: SortKey[] = ['distance', 'rating', 'reviews'];

export function readUrl(search: string = window.location.search): AppState {
  const p = new URLSearchParams(search);
  const num = (k: string) => {
    const v = Number(p.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const sort = p.get('sort');
  const ll = (p.get('ll') ?? '').split(',').map(Number);
  return {
    near: p.get('near') || undefined,
    ll:
      ll.length === 2 && Number.isFinite(ll[0]) && Number.isFinite(ll[1])
        ? { lat: ll[0], lng: ll[1] }
        : undefined,
    r: num('r'),
    cat: p.get('cat')?.split(',').filter(Boolean),
    q: p.get('q') || undefined,
    sort: sort && (SORTS as string[]).includes(sort) ? (sort as SortKey) : undefined,
    open: p.get('open') === '1' || undefined,
    min: num('min'),
    place: p.get('place') || undefined,
    all: p.get('all') === '1' || undefined,
    discover: p.get('discover') === '1' || undefined,
  };
}

export function toSearch(s: AppState): string {
  const p = new URLSearchParams();
  if (s.near) p.set('near', s.near);
  if (s.ll) p.set('ll', `${s.ll.lat.toFixed(6)},${s.ll.lng.toFixed(6)}`);
  if (s.r) p.set('r', String(s.r));
  if (s.cat?.length) p.set('cat', s.cat.join(','));
  if (s.q) p.set('q', s.q);
  if (s.sort && s.sort !== 'distance') p.set('sort', s.sort);
  if (s.open) p.set('open', '1');
  if (s.min) p.set('min', String(s.min));
  if (s.place) p.set('place', s.place);
  if (s.all) p.set('all', '1');
  if (s.discover) p.set('discover', '1');
  const q = p.toString();
  return q ? `?${q}` : window.location.pathname;
}

/**
 * 주소창을 갱신한다.
 * 검색어·필터는 replace(뒤로가기가 글자 하나마다 걸리면 못 쓴다),
 * 가게 선택은 push(뒤로가기로 목록에 돌아오는 게 자연스럽다).
 */
export function writeUrl(s: AppState, mode: 'push' | 'replace' = 'replace') {
  const url = toSearch(s);
  if (url === window.location.search || url === window.location.href) return;
  if (mode === 'push') window.history.pushState(s, '', url);
  else window.history.replaceState(s, '', url);
}
