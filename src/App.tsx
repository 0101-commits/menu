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
import { ListPanel, useDesktop, type Snap } from './components/ListPanel';
import type { Discovered, Place, RatingsMap } from './types';
import { loadPlaces, loadRatings } from './lib/data';
import { buildIndex, parseQuery, searchPlaces } from './lib/search';
import { computeMeans, rawOf, summarize, type SourceMeans } from './lib/rating';
import { haversine, distanceM } from './lib/geo';
import { isOpenNow } from './lib/hours';
import { discoverNearby, geocodePlace } from './lib/kakao';
import { GOOGLE_ENABLED, RATINGS_API, fetchRatings } from './lib/worker';
import { readUrl, writeUrl, type SortKey } from './lib/url-state';
import { useVisits } from './lib/visits';

type ColorScheme = 'light' | 'dark';

function readColorScheme(): ColorScheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-seed-user-color-scheme') === 'dark' ? 'dark' : 'light';
}

const DEFAULT_MEANS: SourceMeans = { naver: 4.3, kakao: 3.9, google: 4.2 };
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
  const [ratings, setRatings] = useState<RatingsMap>({});
  const [means, setMeans] = useState<SourceMeans>(DEFAULT_MEANS);
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
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);

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
  const [colorScheme, setColorScheme] = useState<ColorScheme>(readColorScheme);
  const chipBarRef = useRef<HTMLDivElement>(null);
  const [chipBarHeight, setChipBarHeight] = useState(48);

  // 칩 바 높이는 칩 크기와 줄바꿈에 따라 달라진다. 상수로 박아두면 지도 상단이 가려진다.
  useEffect(() => {
    const el = chipBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setChipBarHeight(entry.contentRect.height));
    ro.observe(el);
    setChipBarHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

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
      .then((r) => {
        if (!alive) return;
        setRatings(r);
        setMeans(computeMeans(r));
      })
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
        setRatings((prev) => ({ ...prev, [sid]: { ...prev[sid], google: r.google } }));
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
  const hasHours = useMemo(() => Object.values(ratings).some((r) => r.kakao?.hours?.length), [ratings]);
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
        const k = ratings[p.placeId]?.kakao;
        return isOpenNow(k?.hours, now, k?.hoursDay);
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
  useEffect(() => {
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
    });
  }, [near, radius, categories, textFilter, sort, openOnly, minScore, detailPlace, scope, discover]);

  // ---------- 조작 ----------
  const handleSelect = useCallback((p: Place | null) => {
    setSelectedPlace(p);
    if (p && !desktop && snap === 'peek') setSnap('half');
  }, [desktop, snap]);

  const handleDetail = useCallback((p: Place) => {
    setSelectedPlace(p);
    setDetailPlace(p);
    if (!desktop) setSnap('full');
  }, [desktop]);

  const handleViewChange = useCallback((vp: Place[], center: { lat: number; lng: number }) => {
    setVisiblePlaces(vp);
    setMapCenter(center);
  }, []);

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
            selectedCategories={categories}
            selectedPlace={selectedPlace}
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
          />
        )}
      </div>

      {/* 카테고리 칩 */}
      <div
        ref={chipBarRef}
        className="absolute top-0 right-0 left-0 lg:left-[416px] z-20 bg-surface/95 backdrop-blur-sm border-b border-line-subtle"
      >
        <CategoryBar available={available} selected={categories} onChange={setCategories} counts={counts} />
      </div>

      <ListPanel snap={snap} onSnapChange={setSnap} desktop={desktop}>
        <header className="px-4 py-2.5 bg-primary text-on-primary shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="font-bold text-base">맛핀</span>
            <span className="text-sm opacity-80 truncate tabular-nums">
              {filtered.length.toLocaleString()}곳
              {geocoding && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" aria-label="검색 중" />}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={pickRandom}
              aria-label="아무 곳이나 고르기"
              className="grid place-items-center w-11 h-11 rounded-lg hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current transition-colors"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleColorScheme}
              aria-label={colorScheme === 'dark' ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기'}
              className="grid place-items-center w-11 h-11 rounded-lg hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current transition-colors"
            >
              {colorScheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {detailPlace ? (
          <PlaceSheet
            place={detailPlace}
            ratings={ratings[detailPlace.placeId]}
            means={means}
            googleEnabled={GOOGLE_ENABLED}
            onClose={() => setDetailPlace(null)}
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
              onPickNow={pickNow}
              regionOpen={regionOpen}
              onRegionOpenChange={setRegionOpen}
              regionLabel={regionLabelOf(region)}
              total={places.length}
            />

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
                ratingsLoading={ratingsLoading}
                selectedPlaceId={selectedPlace?.placeId ?? null}
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

            {withScore > 0 && !ratingsLoading && (
              <p className="shrink-0 px-3 py-1.5 m-0 text-xs text-fg-subtle border-t border-line-subtle tabular-nums">
                평점 수집 {withScore.toLocaleString()} / {places.length.toLocaleString()}곳
              </p>
            )}
          </>
        )}
      </ListPanel>

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
