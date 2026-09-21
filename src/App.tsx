// 화면 전체의 상태를 한 곳에서 잇는다.
//
// 흐름
//   검색어 → parseQuery 로 카테고리 토큰을 떼고, 남은 말이 지명이면 중심점으로 삼는다.
//   중심점이 있으면 반경 안, 없으면 지도 범위(또는 전체)가 목록의 바탕이 된다.
//   그 위에 행정구역·카테고리·검색어·영업중·평점 필터를 순서대로 얹고 정렬한다.
//   결과 상태는 URL 에 적는다. 새로고침·뒤로가기·공유가 한 번에 해결된다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Moon, Sun, ChevronUp, Shuffle, Loader2 } from 'lucide-react';
import { MapView, type MapFocus } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { PlaceSheet } from './components/PlaceSheet';
import { CategoryBar } from './components/CategoryBar';
import { ListToolbar } from './components/ListToolbar';
import { RegionPicker, regionLabelOf } from './components/RegionPicker';
import { ListPanel, sheetInset, useDesktop, type Snap } from './components/ListPanel';
import type { Discovered, GoogleRating, Place, RatingsMap } from './types';
import { listSignature, loadPlaces, loadRatings } from './lib/data';
import { buildIndex, parseQuery, searchPlaces } from './lib/search';
import { computeMeans, rawOf, summarize } from './lib/rating';
import { haversine, distanceM } from './lib/geo';
import { isOpenNow } from './lib/hours';
import { discoverNearby, geocodePlace } from './lib/kakao';
import { GOOGLE_ENABLED, RATINGS_API, fetchGoogleByIds, fetchRatings } from './lib/worker';
import { readUrl, writeUrl, type SortKey } from './lib/url-state';
import { useVisits } from './lib/visits';

type ColorScheme = 'light' | 'dark';

function readColorScheme(): ColorScheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-seed-user-color-scheme') === 'dark' ? 'dark' : 'light';
}

const EMPTY_REGION = { sido: '', sigungu: '', dong: '' };

interface Near {
  label: string;
  lat: number;
  lng: number;
}

export default function App() {
  const initial = useRef(readUrl()).current;

  // ---------- 데이터 ----------
  const [places, setPlaces] = useState<Place[]>([]);
  const [baseRatings, setBaseRatings] = useState<RatingsMap>({});
  // 구글은 공개 데이터에 못 넣는다(약관). Worker KV 에 있는 것을,
  // 목록에 실제로 그려진 가게에 한해 묶어서 받아 얹는다(키는 네이버 placeId).
  const [googleById, setGoogleById] = useState<Record<string, GoogleRating>>({});
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ratingsLoading, setRatingsLoading] = useState(true);

  // ---------- 질의 ----------
  const [query, setQuery] = useState(initial.q ?? initial.near ?? '');
  const [textFilter, setTextFilter] = useState(initial.q ?? '');
  const [categories, setCategories] = useState<string[]>(initial.cat ?? []);
  const [near, setNear] = useState<Near | null>(null);
  const [radius, setRadius] = useState(initial.r ?? 500);
  const [scope, setScope] = useState<'map' | 'all'>(initial.all ? 'all' : 'map');
  const [region, setRegion] = useState({ sido: '', sigungu: '', dong: '' });
  const [regionOpen, setRegionOpen] = useState(false);
  const [openOnly, setOpenOnly] = useState(Boolean(initial.open));
  const [minScore, setMinScore] = useState<number | null>(initial.min ?? null);
  const [unvisitedOnly, setUnvisitedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>(initial.sort ?? 'distance');
  const [geocoding, setGeocoding] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);

  // ---------- 지도 ----------
  // null = 지도가 아직 범위를 알려주지 않았다(로딩 중이거나 실패). 빈 배열과 구분해야 한다 —
  // 빈 배열로 두면 지도가 안 뜬 동안 목록이 0곳이 되어 앱 전체가 죽은 것처럼 보인다.
  const [visiblePlaces, setVisiblePlaces] = useState<Place[] | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  // 지도 확대 단계. 주소에 적어 두지 않으면 새로고침했을 때 중심만 맞고 배율이 달라진다.
  const [mapLevel, setMapLevel] = useState<number | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  // 지도를 움직이면 목록도 따라갈지. 끄면 목록이 그 자리에 얼고, 지도 위에 "이 지역에서 다시 찾기" 가 뜬다.
  const [follow, setFollow] = useState(initial.follow !== false);
  // follow 가 꺼진 동안 지도가 알려 준 최신 범위. 버튼을 눌러야 목록에 반영된다.
  const [pendingView, setPendingView] = useState<Place[] | null>(null);

  // ---------- 발견 ----------
  const [discover, setDiscover] = useState(Boolean(initial.discover));
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [discoveredRatings, setDiscoveredRatings] = useState<RatingsMap>({});
  const [discoverFailed, setDiscoverFailed] = useState<Set<string>>(() => new Set());

  // ---------- 껍데기 ----------
  const { visits, toggle: toggleVisit, setNote } = useVisits();
  const visitedIds = useMemo(() => new Set(Object.keys(visits)), [visits]);

  const desktop = useDesktop();
  const [snap, setSnap] = useState<Snap>('half');

  // 시트가 지도 아래쪽을 몇 px 덮는지. 지도가 이걸 알아야 선택한 가게의 팝업을
  // 시트 뒤가 아니라 보이는 자리에 띄운다(실측: 예전에는 100% 가려졌다).
  const [viewportH, setViewportH] = useState(() => (typeof window === 'undefined' ? 0 : window.innerHeight));
  useEffect(() => {
    const on = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const bottomInset = desktop ? 0 : sheetInset(snap, viewportH);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(readColorScheme);
  const chipBarRef = useRef<HTMLDivElement>(null);
  const [chipBarHeight, setChipBarHeight] = useState(48);

  // 칩 바 높이는 칩 크기와 줄바꿈에 따라 달라진다. 상수로 박아두면 지도 상단이 가려진다.
  // 모바일에서는 칩 바가 지도 위에 없다(시트 안으로 들였다) — 잴 것도 없다.
  useEffect(() => {
    if (!desktop) { setChipBarHeight(0); return; }
    const el = chipBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setChipBarHeight(entry.contentRect.height));
    ro.observe(el);
    setChipBarHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [desktop]);

  // ---------- 로딩 ----------
  useEffect(() => {
    let alive = true;
    loadPlaces()
      .then((ps) => {
        if (!alive) return;
        setPlaces(ps);
        setDataState('ready');
        if (initial.place) {
          const hit = ps.find((p) => p.placeId === initial.place);
          if (hit) { setSelectedPlace(hit); setDetailPlace(hit); }
        }
      })
      .catch(() => { if (alive) setDataState('error'); });

    loadRatings()
      .then((r) => { if (alive) setBaseRatings(r); })
      .finally(() => { if (alive) setRatingsLoading(false); });

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL 로 들어온 중심점 복원. 좌표가 같이 실려 있으면 지오코딩을 건너뛴다 —
  // 링크가 항상 같은 곳을 가리키고, 지도 SDK 가 늦어도 범위가 복원된다.
  useEffect(() => {
    if (!initial.near) return;
    if (initial.ll) {
      setNear({ label: initial.near, lat: initial.ll.lat, lng: initial.ll.lng });
      return;
    }
    setGeocoding(true);
    geocodePlace(initial.near)
      .then((hits) => {
        if (hits[0]) setNear({ label: initial.near!, lat: hits[0].lat, lng: hits[0].lng });
        else setSearchNotice(`'${initial.near}' 위치를 찾지 못했습니다.`);
      })
      .finally(() => setGeocoding(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 중심점이 바뀌면 지도에 반경을 그린다.
  useEffect(() => {
    if (near) setFocus({ lat: near.lat, lng: near.lng, radius, key: Date.now() });
  }, [near, radius]);

  // 목록용 구글 값을 평점 맵에 얹는다. 상세를 열어 받은 값이 이미 있으면 그쪽이 최신이다.
  const ratings = useMemo(() => {
    if (!Object.keys(googleById).length) return baseRatings;
    const next: RatingsMap = { ...baseRatings };
    for (const [sid, g] of Object.entries(googleById)) {
      next[sid] = { ...next[sid], google: next[sid]?.google ?? g };
    }
    return next;
  }, [baseRatings, googleById]);

  // 화면에 실제로 그려진 카드만 묻는다.
  //
  // 예전에는 워커가 4,084곳치를 통짜 블롭(g:all)으로 들고 있다가 통째로 내려줬는데,
  // 그 블롭을 채우려면 전량을 미리 받아 둬야 했다(그리고 그 길이 막혀 칸이 영영 비었다).
  // 본 것만 묻는 쪽이 요금도 보관도 실제로 쓰는 만큼이다. 한 번 물은 ID 는 다시 묻지 않는다.
  const askedGoogle = useRef(new Set<string>());
  const requestGoogle = useCallback((batch: Place[]) => {
    if (!GOOGLE_ENABLED) return;
    const fresh = batch.filter((p) => p.googlePlaceId && !askedGoogle.current.has(p.googlePlaceId));
    if (!fresh.length) return;
    for (const p of fresh) askedGoogle.current.add(p.googlePlaceId!);
    fetchGoogleByIds(fresh.map((p) => p.googlePlaceId!)).then((got) => {
      if (!Object.keys(got).length) return;
      setGoogleById((prev) => {
        const next = { ...prev };
        for (const p of fresh) {
          const v = got[p.googlePlaceId!];
          if (v) next[p.placeId] = v;
        }
        return next;
      });
    });
  }, []);

  // 소스별 전체 평균. 구글이 얹히면 값이 달라지므로 맵이 바뀔 때마다 다시 센다.
  const means = useMemo(() => computeMeans(ratings), [ratings]);

  // 구글 칸을 목록에 세울지. 데이터가 실제로 왔을 때만 세운다 —
  // 늘 비는 칸을 세워 두면 카드 가로의 1/3 이 빈칸으로 남는다(그래서 한 번 걷어냈다).
  const googleReady = Boolean(Object.keys(googleById).length);

  // ---------- 검색 ----------
  const index = useMemo(() => buildIndex(places), [places]);

  const runSearch = useCallback(async () => {
    const parsed = parseQuery(query);
    if (parsed.categories.length) setCategories((prev) => [...new Set([...prev, ...parsed.categories])]);
    setSearchNotice(null);

    const text = parsed.text.trim();
    if (!text) { setNear(null); setTextFilter(''); setRegion(EMPTY_REGION); return; }

    // 가게 이름이 맞으면 가게 검색이다. 단 "강남역" 처럼 지명꼴이면 지명이 먼저다 —
    // "…강남역점" 같은 가게가 있다고 해서 역을 못 찾으면 안 된다.
    //
    // 동 이름("성수동")은 따로 다루지 않는다. 법정동은 "성수동1가"·"성수동2가" 라
    // 정확히 일치하는 일이 드물고, 검색 인덱스가 dong 을 이미 포함하므로
    // 평범한 텍스트 검색이 접두 일치로 둘 다 잡는다.
    const looksLikePlace = /(역|공원|대학교|터미널|공항|시장|광장|타워|스퀘어)$/.test(text);
    if (!looksLikePlace && places.some((p) => p.name.includes(text))) {
      setNear(null);
      setTextFilter(text);
      return;
    }

    setGeocoding(true);
    try {
      const hits = await geocodePlace(text);
      if (hits[0]) {
        // 지명으로 해석했으면 그 말은 "어디" 를 뜻한다. 목록까지 그 글자로 거르면 0 건이 된다.
        setNear({ label: text, lat: hits[0].lat, lng: hits[0].lng });
        setTextFilter('');
        setRegion(EMPTY_REGION);
      } else {
        setNear(null);
        setTextFilter(text);
        setSearchNotice(`'${text}' 위치를 찾지 못했습니다. 가게 이름으로 찾아봅니다.`);
      }
    } finally {
      setGeocoding(false);
    }
  }, [query, places]);

  // 타이핑 중에는 목록만 좁힌다(지오코딩은 Enter 에서).
  //
  // 입력을 비웠을 때 중심점을 푸는 일은 여기서 하지 않는다. near 가 deps 에 있어서,
  // "지금 갈 만한 곳"(검색어 없이 중심점만 세운다)이 220ms 뒤 스스로 취소됐다.
  // 그건 사용자가 입력을 지운 사건이므로 입력 핸들러가 할 일이다.
  useEffect(() => {
    const t = setTimeout(() => {
      const parsed = parseQuery(query);
      // 이미 중심점으로 쓰인 말을 목록 필터로 다시 쓰지 않는다.
      setTextFilter(near && parsed.text.trim() === near.label ? '' : parsed.text);
    }, 220);
    return () => clearTimeout(t);
  }, [query, near]);

  const handleQueryChange = useCallback((v: string) => {
    setQuery(v);
    if (!v.trim()) { setNear(null); setSearchNotice(null); }
  }, []);

  // ---------- 발견 ----------
  useEffect(() => {
    if (!discover) { setDiscovered([]); return; }
    const center = near ?? mapCenter;
    if (!center) return;
    let alive = true;
    discoverNearby(center.lat, center.lng, near ? radius : 800).then((list) => {
      if (alive) setDiscovered(list);
    });
    return () => { alive = false; };
  }, [discover, near, mapCenter, radius]);

  const onDiscoveredOpen = useCallback((d: Discovered) => {
    const key = `k:${d.kakaoId}`;
    if (discoveredRatings[key] || !RATINGS_API) return;
    setDiscoverFailed((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    fetchRatings({ k: d.kakaoId })
      .then((r) => setDiscoveredRatings((prev) => ({ ...prev, [key]: r })))
      // 실패를 "평점 없음" 으로 삼키지 않는다. 창에 그렇게 적고 다시 시도를 띄운다.
      .catch(() => setDiscoverFailed((prev) => new Set(prev).add(key)));
  }, [discoveredRatings]);

  // 구글 평점은 카드를 열 때만 받는다(30일 캐시 정책 + 무료 한도).
  useEffect(() => {
    if (!GOOGLE_ENABLED || !detailPlace?.googlePlaceId) return;
    const sid = detailPlace.placeId;
    if (ratings[sid]?.google) return;
    fetchRatings({ g: detailPlace.googlePlaceId })
      .then((r) => {
        if (!r.google) return;
        setBaseRatings((prev) => ({ ...prev, [sid]: { ...prev[sid], google: r.google } }));
      })
      // 구글 칸은 이미 "수집 전" 으로 보인다. 실패분은 캐시에 남지 않으니 다시 열면 재시도된다.
      .catch(() => {});
  }, [detailPlace, ratings]);

  // ---------- 목록 ----------
  // 거리의 기준점. 매 렌더마다 새 객체를 만들면 아래 useMemo 가 계속 다시 돈다.
  const origin = useMemo(
    () => near ?? (selectedPlace ? { lat: selectedPlace.lat, lng: selectedPlace.lng } : null),
    [near, selectedPlace],
  );

  // 거리를 "적는" 기준점. 정렬 기준(origin)과 일부러 나눈다 — 지도 중심은 팬할 때마다 바뀌므로
  // 정렬에 쓰면 손가락을 뗄 때마다 목록 순서가 튄다. 표시에만 쓰면 진입 직후에도 거리가 보인다.
  const distanceOrigin = useMemo(() => origin ?? mapCenter, [origin, mapCenter]);

  // 평점 기반 필터를 걸 수 있는 상태인지. 카카오 매칭 전에는 영업시간이 아예 없다.
  const hasHours = useMemo(() => Object.values(ratings).some((r) => r.hours?.length), [ratings]);
  const hasScores = useMemo(
    () => Object.values(ratings).some((r) => rawOf(r, 'naver') || rawOf(r, 'kakao') || rawOf(r, 'google')),
    [ratings],
  );

  // 바탕 목록(지도 범위 / 전체 / 반경)만 다르고 나머지 조건은 같다.
  // 한 함수로 두어야 "지도 밖에 N곳 더" 계산이 실제 목록과 같은 기준으로 센다.
  const applyFilters = useCallback((input: Place[]) => {
    let list = input;
    if (region.sido) list = list.filter((p) => p.sido === region.sido);
    if (region.sigungu) list = list.filter((p) => p.sigungu === region.sigungu);
    if (region.dong) list = list.filter((p) => p.dong === region.dong);
    if (categories.length) list = list.filter((p) => categories.includes(p.category));

    if (textFilter.trim()) {
      const allowed = new Set(list.map((p) => p.placeId));
      list = searchPlaces(index, textFilter).filter((p) => allowed.has(p.placeId));
    }

    if (unvisitedOnly) list = list.filter((p) => !visitedIds.has(p.placeId));

    // 영업시간·평점이 아직 없으면 그 조건을 걸지 않는다. 전부 "모름" 인 상태에서
    // 규칙대로 거르면 4,084곳이 통째로 탈락해 "0곳" 만 남는다 — 필터가 아니라 고장으로 보인다.
    if (openOnly && hasHours) {
      const now = new Date();
      list = list.filter((p) => {
        const r = ratings[p.placeId];
        return isOpenNow(r?.hours, now, r?.hoursDay);
      });
    }
    if (minScore != null && hasScores) {
      list = list.filter((p) => {
        const s = summarize(ratings[p.placeId], means).combined;
        return s != null && s >= minScore;
      });
    }
    return list;
  }, [region, categories, textFilter, index, unvisitedOnly, visitedIds, openOnly, minScore, ratings, means, hasHours, hasScores]);

  const filtered = useMemo(() => {
    let list: Place[];
    if (near) {
      list = places.filter((p) => distanceM(near.lat, near.lng, p.lat, p.lng) <= radius);
    } else if (scope === 'all' || !visiblePlaces) {
      list = places;
    } else {
      list = visiblePlaces;
    }

    list = applyFilters(list);

    const sorted = [...list];
    if (sort === 'distance' && origin) {
      sorted.sort((a, b) =>
        haversine(origin.lat, origin.lng, a.lat, a.lng) - haversine(origin.lat, origin.lng, b.lat, b.lng));
    } else if (sort === 'rating') {
      sorted.sort((a, b) =>
        (summarize(ratings[b.placeId], means).combined ?? -1) -
        (summarize(ratings[a.placeId], means).combined ?? -1));
    } else if (sort === 'reviews') {
      const n = (p: Place) => summarize(ratings[p.placeId], means).totalReviews;
      sorted.sort((a, b) => n(b) - n(a));
    }
    return sorted;
  }, [places, visiblePlaces, near, radius, scope, applyFilters, ratings, means, sort, origin]);

  // 지도 범위 밖에 있는 결과 수. "지도 범위" 를 켠 채로 검색하면 화면 밖 가게가 빠지는데,
  // 그걸 말해 주지 않으면 "없는 가게" 로 오해한다.
  const outsideCount = useMemo(() => {
    if (near || scope === 'all' || !visiblePlaces || !textFilter.trim()) return 0;
    // 같은 applyFilters 를 쓴다. 조건이 어긋나면 "지도 밖에 7곳" 이라 해놓고
    // 전체로 바꿨을 때 4곳만 느는 식으로 숫자가 거짓말을 한다.
    return Math.max(0, applyFilters(places).length - filtered.length);
  }, [near, scope, textFilter, places, applyFilters, filtered.length, visiblePlaces]);

  // 검색어가 있으면 정렬이 이미 관련도 순이다. 거리순을 강제하지 않는다.
  const canSortDistance = Boolean(origin);
  useEffect(() => {
    if (sort === 'distance' && !canSortDistance) setSort('rating');
  }, [sort, canSortDistance]);

  // ---------- URL ----------
  // 가게를 연 순간만 히스토리를 쌓는다. 그래야 뒤로가기가 목록으로 돌아온다 —
  // 예전에는 전부 replace 라 히스토리가 한 칸도 안 늘었고(실측 14→14),
  // 상세를 열어 둔 채 뒤로가기를 누르면 앱을 통째로 벗어났다.
  const lastPlaceRef = useRef<string | undefined>(initial.place);
  const pushedRef = useRef(false);

  useEffect(() => {
    const place = detailPlace?.placeId;
    const opened = Boolean(place) && place !== lastPlaceRef.current;
    lastPlaceRef.current = place;
    if (opened) pushedRef.current = true;
    if (!place) pushedRef.current = false;
    writeUrl({
      near: near?.label,
      ll: near ? { lat: near.lat, lng: near.lng } : undefined,
      r: near ? radius : undefined,
      cat: categories,
      q: textFilter || undefined,
      sort,
      open: openOnly,
      min: minScore ?? undefined,
      place: detailPlace?.placeId,
      all: scope === 'all' || undefined,
      discover: discover || undefined,
      // 지도 자리도 적는다. 지도는 'idle' 에서만 알려 주므로 손을 뗀 뒤 한 번씩만 바뀐다.
      c: mapCenter ?? undefined,
      z: mapLevel ?? undefined,
      follow: follow ? undefined : false,
    }, opened ? 'push' : 'replace');
  }, [near, radius, categories, textFilter, sort, openOnly, minScore, detailPlace, scope, discover, mapCenter, mapLevel, follow]);

  // 뒤로가기·앞으로가기. 주소가 진실이고 화면이 그걸 따라간다.
  useEffect(() => {
    const on = () => {
      const s = readUrl();
      const hit = s.place ? places.find((p) => p.placeId === s.place) ?? null : null;
      lastPlaceRef.current = hit?.placeId;
      setDetailPlace(hit);
      if (hit) {
        setSelectedPlace(hit);
        if (!desktop) setSnap('full');
      } else if (!desktop) {
        setSnap((cur) => (cur === 'full' ? 'half' : cur));
      }
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, [places, desktop]);

  // ---------- 조작 ----------
  const handleDetail = useCallback((p: Place) => {
    setSelectedPlace(p);
    setDetailPlace(p);
    if (!desktop) setSnap('full');
  }, [desktop]);

  const handleSelect = useCallback((p: Place | null) => {
    setSelectedPlace(p);
    if (!p) return;
    // 데스크톱은 마커 한 번 누르면 바로 상세다. 네이버·구글 PC 가 똑같이 한다 —
    // 목록 패널은 그대로 남고 상세가 그 옆에 선다.
    if (desktop) { setDetailPlace(p); return; }
    // 모바일은 한 번 누르면 시트 맨 위 고른 카드까지, 그 카드를 다시 눌러야 상세다.
    // 좁은 화면에서 1탭에 전체화면 상세로 가면 지도에서 고른 맥락을 곧바로 잃는다.
    if (snap === 'peek' || snap === 'full') setSnap('half');
  }, [desktop, snap]);

  // 상세 닫기. 열 때 히스토리를 쌓았으면 뒤로가기로 닫는다 —
  // 그래야 주소·히스토리·화면이 어긋나지 않는다(닫기 버튼과 기기 뒤로가기가 같은 일을 한다).
  const closeDetail = useCallback(() => {
    if (pushedRef.current) { window.history.back(); return; }
    setDetailPlace(null);
    if (!desktop) setSnap((cur) => (cur === 'full' ? 'half' : cur));
  }, [desktop]);

  const handleViewChange = useCallback((vp: Place[], center: { lat: number; lng: number }, level: number) => {
    // 중심·배율은 언제나 적는다(새로고침 복원). 목록만 follow 를 따른다.
    setMapCenter(center);
    setMapLevel(level);
    if (follow) { setVisiblePlaces(vp); setPendingView(null); return; }
    setPendingView(vp);
  }, [follow]);

  // 지도가 보여 준 범위를 목록에 반영한다("이 지역에서 다시 찾기").
  const applyPendingView = useCallback(() => {
    if (pendingView) setVisiblePlaces(pendingView);
    setPendingView(null);
  }, [pendingView]);

  // 다시 따라가기로 바꾸면 밀린 범위를 바로 반영한다.
  useEffect(() => {
    if (follow && pendingView) { setVisiblePlaces(pendingView); setPendingView(null); }
  }, [follow, pendingView]);

  // 지도에 번호를 달 상위 20곳. 목록과 지도를 눈으로 잇는 유일한 장치다.
  const numbered = useMemo(() => filtered.slice(0, 20).map((p) => p.placeId), [filtered]);

  // 버튼은 "밀린 것이 실제로 다를 때" 만. 지도를 끌었다 제자리로 돌아오면 띄울 이유가 없다.
  const pendingDiffers = useMemo(
    () => Boolean(pendingView) && listSignature(pendingView!) !== listSignature(visiblePlaces ?? []),
    [pendingView, visiblePlaces],
  );

  const toggleColorScheme = () => {
    const next: ColorScheme = colorScheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-seed-user-color-scheme', next);
    try { localStorage.setItem('matpin-color-scheme', next); } catch { /* 프라이빗 모드 */ }
    setColorScheme(next);
  };

  // 현위치 1km · 영업 중 · 평점순을 한 번에 건다. 저녁마다 하는 그 질문 하나를 위한 지름길.
  const pickNow = useCallback(() => {
    if (!navigator.geolocation) { setSearchNotice('이 브라우저는 위치 기능을 지원하지 않습니다.'); return; }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNear({ label: '내 위치', lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRadius(1000);
        // 영업시간 데이터가 없으면 "영업 중" 을 켜 봐야 0곳이 된다.
        setOpenOnly(hasHours);
        setSort('rating');
        setQuery('');
        setTextFilter('');
        setSearchNotice(null);
        setGeocoding(false);
      },
      () => {
        setSearchNotice('위치를 못 가져왔습니다. 주소창 왼쪽 자물쇠 아이콘 > 위치 > 허용으로 바꾼 뒤 다시 눌러주세요.');
        setGeocoding(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [hasHours]);

  const pickRandom = () => {
    if (!filtered.length) return;
    const p = filtered[Math.floor(Math.random() * filtered.length)];
    handleDetail(p);
  };

  const available = useMemo(() => [...new Set(places.map((p) => p.category))], [places]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of filtered) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [filtered]);

  const withScore = useMemo(
    () => Object.values(ratings).filter((r) => rawOf(r, 'naver') || rawOf(r, 'kakao')).length,
    [ratings],
  );

  // ---------- 렌더 ----------
  return (
    <div className="h-[100svh] w-screen overflow-hidden relative bg-surface-sunken text-fg">
      {/* 지도.
          isolate 로 쌓임 맥락을 만들어 MapView 내부의 로딩·에러 오버레이가
          패널과 칩 바 위로 올라오지 못하게 막는다.
          이게 없으면 지도 로딩 실패 시 화면 전체가 덮여 목록도 못 쓴다. */}
      <div className="absolute inset-0 isolate">
        {dataState === 'ready' && (
          <MapView
            places={places}
            ratings={ratings}
            means={means}
            showGoogle={googleReady}
            selectedCategories={categories}
            selectedPlace={selectedPlace}
            // 지도 위 카드는 "상세가 아직 안 열렸을 때" 만 쓸모가 있다.
            // 모바일은 시트 맨 위 고정 카드가, 데스크톱은 옆에 선 상세 패널이 같은 내용을
            // 이미 더 넓게 보여준다 — 그 위에 또 띄우면 지도만 가린다. 그때는 이름표만.
            showPopup={desktop && !detailPlace}
            numbered={numbered}
            onSelect={handleSelect}
            onDetail={handleDetail}
            onBoundsChange={handleViewChange}
            focus={focus}
            discovered={discovered}
            discoveredRatings={discoveredRatings}
            onDiscoveredOpen={onDiscoveredOpen}
            discoverFailed={discoverFailed}
            discoverUnavailable={!RATINGS_API}
            topOffset={chipBarHeight}
            bottomInset={bottomInset}
            initialView={{ c: initial.c, z: initial.z }}
          />
        )}
      </div>

      {/* 목록을 고정해 둔 동안 지도를 옮겼을 때만 뜬다. 네이버·구글이 같은 자리에 같은 버튼을 둔다. */}
      {pendingDiffers && (
        <button
          type="button"
          onClick={applyPendingView}
          className="absolute z-30 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-surface-raised text-fg border border-line shadow-lg px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-surface-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          style={{ top: (desktop ? chipBarHeight : 0) + 16 }}
        >
          <MapPin className="w-4 h-4 text-primary-fg" aria-hidden="true" />
          이 지역에서 다시 찾기
          <span className="text-xs font-normal text-fg-muted tabular-nums">{pendingView?.length.toLocaleString()}곳</span>
        </button>
      )}

      {/* 카테고리 칩. 데스크톱에서만 지도 위에 선다 —
          모바일에서는 60.8px 를 늘 먹었고, 그만큼이 목록에서 빠졌다(시트 안으로 들였다). */}
      {desktop && (
        <div
          ref={chipBarRef}
          className="absolute top-0 right-0 left-[416px] z-20 bg-surface/95 backdrop-blur-sm border-b border-line-subtle"
        >
          <CategoryBar available={available} selected={categories} onChange={setCategories} counts={counts} />
        </div>
      )}

      <ListPanel
        snap={snap}
        onSnapChange={setSnap}
        desktop={desktop}
        title={
          /* 손잡이와 한 줄로 합쳤다. 예전에는 손잡이 44px + 헤더 64px 가 따로 서서
             half 스냅에서 목록 본문이 111px 밖에 안 남았다(카드 한 장이 173px 인데). */
          <header className="px-3 pb-1.5 pt-1 shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-4 h-4 shrink-0 text-primary-fg" aria-hidden="true" />
              <span className="font-bold text-sm text-fg">맛핀</span>
              <span className="text-sm text-fg-muted truncate tabular-nums">
                {filtered.length.toLocaleString()}곳
                {scope === 'all' && !near ? ' · 전체' : ''}
                {geocoding && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" aria-label="검색 중" />}
              </span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                data-nodrag
                onClick={pickRandom}
                aria-label="아무 곳이나 고르기"
                className="grid place-items-center w-9 h-9 rounded-lg text-fg-muted hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-nodrag
                onClick={toggleColorScheme}
                aria-label={colorScheme === 'dark' ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기'}
                className="grid place-items-center w-9 h-9 rounded-lg text-fg-muted hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
              >
                {colorScheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </header>
        }
      >
        {/* 모바일에서는 상세가 시트를 차지한다. 데스크톱에서는 목록을 남기고
            상세가 그 옆에 선다(아래 별도 패널) — 네이버·구글 PC 가 그렇게 한다. */}
        {!desktop && detailPlace ? (
          <PlaceSheet
            place={detailPlace}
            ratings={ratings[detailPlace.placeId]}
            means={means}
            googleEnabled={GOOGLE_ENABLED}
            onClose={closeDetail}
            visit={visits[detailPlace.placeId]}
            onToggleVisit={toggleVisit}
            onNote={setNote}
          />
        ) : (
          <>
            <ListToolbar
              query={query}
              onQueryChange={handleQueryChange}
              onSubmit={runSearch}
              scope={scope}
              onScopeChange={setScope}
              nearLabel={near?.label ?? null}
              radius={radius}
              onRadiusChange={setRadius}
              onClearNear={() => { setNear(null); setQuery(''); setTextFilter(''); }}
              openOnly={openOnly}
              onOpenOnlyChange={setOpenOnly}
              openOnlyAvailable={hasHours}
              minScore={minScore}
              onMinScoreChange={setMinScore}
              sort={sort}
              onSortChange={setSort}
              canSortDistance={canSortDistance}
              discover={discover}
              onDiscoverChange={setDiscover}
              unvisitedOnly={unvisitedOnly}
              onUnvisitedOnlyChange={setUnvisitedOnly}
              follow={follow}
              onFollowChange={setFollow}
              onPickNow={pickNow}
              regionOpen={regionOpen}
              onRegionOpenChange={setRegionOpen}
              regionLabel={regionLabelOf(region)}
              total={places.length}
              alwaysExpanded={desktop}
            >
              {!desktop && (
                <div className="-mx-3">
                  <CategoryBar
                    available={available}
                    selected={categories}
                    onChange={setCategories}
                    counts={counts}
                  />
                </div>
              )}
            </ListToolbar>

            {regionOpen && (
              <RegionPicker
                places={places}
                sido={region.sido}
                sigungu={region.sigungu}
                dong={region.dong}
                onChange={setRegion}
              />
            )}

            {searchNotice && (
              <p className="shrink-0 m-0 px-3 py-2 text-xs text-[var(--matpin-closing)] bg-surface-fill border-b border-line-subtle">
                {searchNotice}
              </p>
            )}

            {outsideCount > 0 && (
              <p className="shrink-0 m-0 px-3 py-2 text-xs text-fg-muted bg-surface-fill border-b border-line-subtle flex items-center justify-between gap-2">
                <span>지도 밖에 {outsideCount.toLocaleString()}곳 더 있습니다</span>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className="shrink-0 font-semibold text-primary-fg hover:underline min-h-9 px-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  전체에서 보기
                </button>
              </p>
            )}

            {dataState === 'loading' ? (
              <div className="flex-1 grid place-items-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary-fg" aria-label="불러오는 중" />
              </div>
            ) : dataState === 'error' ? (
              <div className="flex-1 grid place-items-center p-6 text-center">
                <p className="text-sm text-fg-muted m-0">맛집 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>
              </div>
            ) : (
              <PlaceList
                places={filtered}
                ratings={ratings}
                means={means}
                showGoogle={googleReady}
                ratingsLoading={ratingsLoading}
                selectedPlaceId={selectedPlace?.placeId ?? null}
                // 모바일은 고른 가게를 맨 위에 고정하고, 데스크톱은 그 카드로 스크롤한다.
                pinned={!desktop ? selectedPlace : null}
                onUnpin={() => setSelectedPlace(null)}
                autoScroll={desktop}
                onRendered={requestGoogle}
                // 조건을 바꿨을 때만 목록을 맨 위로. 지도를 미는 것으로는 되감지 않는다.
                resetKey={[sort, textFilter, categories.join('|'), openOnly, minScore, unvisitedOnly,
                  region.sido, region.sigungu, region.dong, near?.label ?? '', radius, scope, discover].join(',')}
                onSelect={handleSelect}
                onDetail={handleDetail}
                origin={distanceOrigin}
                visited={visitedIds}
                emptyHint={
                  near
                    ? `${near.label} ${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 안에 없습니다. 반경을 넓혀 보세요.`
                    : openOnly || minScore
                      ? '필터를 풀면 더 보입니다.'
                      : undefined
                }
              />
            )}

            {/* 수집 진행률. 모바일에서는 목록에서 28px 를 가져가는 값에 비해 덜 급하다. */}
            {desktop && withScore > 0 && !ratingsLoading && (
              <p className="shrink-0 px-3 py-1.5 m-0 text-xs text-fg-subtle border-t border-line-subtle tabular-nums">
                평점 수집 {withScore.toLocaleString()} / {places.length.toLocaleString()}곳
              </p>
            )}
          </>
        )}
      </ListPanel>

      {/* 데스크톱 상세. 목록 패널 오른쪽에 나란히 선다 — 목록을 잃지 않는다.
          칩 바가 그 위를 지나가므로 시작 높이를 칩 바 아래로 잡는다. */}
      {desktop && detailPlace && (
        <aside
          className="absolute left-[416px] bottom-4 z-20 w-[380px] flex flex-col bg-surface shadow-2xl rounded-xl overflow-hidden"
          style={{ top: chipBarHeight + 16 }}
        >
          <PlaceSheet
            place={detailPlace}
            ratings={ratings[detailPlace.placeId]}
            means={means}
            googleEnabled={GOOGLE_ENABLED}
            onClose={closeDetail}
            visit={visits[detailPlace.placeId]}
            onToggleVisit={toggleVisit}
            onNote={setNote}
          />
        </aside>
      )}

      {/* 모바일에서 시트가 접혔을 때 올릴 수 있는 손잡이 */}
      {!desktop && snap === 'peek' && (
        <button
          type="button"
          onClick={() => setSnap('half')}
          className="absolute left-1/2 -translate-x-1/2 bottom-[104px] z-20 flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 rounded-full shadow-lg hover:bg-primary-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="font-bold text-sm tabular-nums">{filtered.length.toLocaleString()}곳</span>
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
