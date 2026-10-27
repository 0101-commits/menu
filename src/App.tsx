// 앱 조립 계층.
// 데이터·검색·지도·URL·발견·레이아웃의 상태 수명은 src/hooks에 있고,
// 여기서는 지도/목록/상세가 같은 상태를 보도록 연결한다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Download, Loader2, MapPin, Moon, Shuffle, Sun, ChevronUp } from 'lucide-react';
import { MapView } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { PlaceSheet } from './components/PlaceSheet';
import { CategoryBar } from './components/CategoryBar';
import { ListToolbar } from './components/ListToolbar';
import { RegionPicker, regionLabelOf } from './components/RegionPicker';
import { ListPanel } from './components/ListPanel';
import { DataPanel } from './components/DataPanel';
import { GOOGLE_ENABLED } from './lib/worker';
import { readUrl } from './lib/url-state';
import type { Place } from './types';
import { matchShared, readShare } from './lib/share';
import { useVisits } from './lib/visits';
import { promptInstall, useInstallState } from './lib/install';
import { useAppData } from './hooks/useAppData';
import { useDiscovery } from './hooks/useDiscovery';
import { useLayoutState } from './hooks/useLayoutState';
import { useMapState } from './hooks/useMapState';
import { useSearchState } from './hooks/useSearchState';
import { useUrlSync } from './hooks/useUrlSync';

export default function App() {
  const initial = useRef(readUrl()).current;
  const layout = useLayoutState();
  const installState = useInstallState();
  const { visits, toggle: toggleVisit, setNote, exportJson, importJson } = useVisits();
  const visitedIds = useMemo(() => new Set(Object.keys(visits)), [visits]);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);

  const data = useAppData();
  const map = useMapState({
    initial,
    places: data.places,
    desktop: layout.desktop,
    snap: layout.snap,
    setSnap: layout.setSnap,
  });
  const search = useSearchState({
    initial,
    places: data.places,
    ratings: data.ratings,
    means: data.means,
    visiblePlaces: map.visiblePlaces,
    mapCenter: map.mapCenter,
    selectedPlace: map.selectedPlace,
    visitedIds,
  });
  const discovery = useDiscovery({
    initial: Boolean(initial.discover),
    near: search.near,
    mapCenter: map.mapCenter,
    radius: search.radius,
  });

  const closeDetail = useUrlSync({
    initial,
    places: data.places,
    desktop: layout.desktop,
    setSnap: layout.setSnap,
    detailPlace: map.detailPlace,
    setDetailPlace: map.setDetailPlace,
    setSelectedPlace: map.setSelectedPlace,
    near: search.near,
    radius: search.radius,
    categories: search.categories,
    textFilter: search.textFilter,
    sort: search.sort,
    openOnly: search.openOnly,
    minScore: search.minScore,
    scope: search.scope,
    discover: discovery.discover,
    mapCenter: map.mapCenter,
    mapLevel: map.mapLevel,
    follow: map.follow,
    region: search.region,
  });

  // 상세를 열 때의 목록을 붙잡아 두고 그 안에서 이전·다음으로 넘긴다. 넘길 때마다 지도가 그 가게로
  // 옮겨 가 목록이 다시 정렬되는데, 지금 목록을 그대로 쓰면 순서가 흔들려 봤던 가게로 되돌아간다.
  const detailListRef = useRef<Place[]>([]);
  const detailId = map.detailPlace?.placeId;
  const detailList = useMemo(() => {
    if (!detailId) return (detailListRef.current = []);
    if (!detailListRef.current.some((place) => place.placeId === detailId)) detailListRef.current = search.filtered;
    return detailListRef.current;
    // 목록이 바뀔 때가 아니라 상세 가게가 바뀔 때만 다시 붙잡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);
  const detailIndex = detailList.findIndex((place) => place.placeId === detailId);
  const detailNav = detailIndex < 0 || detailList.length < 2 ? undefined : {
    onPrev: detailIndex > 0 ? () => map.handleDetail(detailList[detailIndex - 1]) : undefined,
    onNext: detailIndex < detailList.length - 1 ? () => map.handleDetail(detailList[detailIndex + 1]) : undefined,
    position: `${detailIndex + 1}/${detailList.length}`,
  };

  // 다른 앱에서 「공유」로 열렸으면(manifest share_target) 받은 글에서 저장한 가게를 찾아 연다.
  // 없으면 그 이름으로 검색하고 발견 모드를 켜 — 저장 안 한 가게도 지도에 뜨게 한다.
  const shared = useRef(readShare()).current;
  const sharedDone = useRef(false);
  useEffect(() => {
    if (!shared || sharedDone.current || !data.places.length) return;
    sharedDone.current = true;
    const hit = matchShared(shared, data.places);
    if (hit?.kind === 'place') map.handleDetail(hit.place);
    else if (hit?.kind === 'search') { void search.runSearch(hit.text); discovery.setDiscover(true); }
    else search.setSearchNotice('공유한 내용에서 가게 이름을 찾지 못했습니다. 이름으로 검색해 주세요.');
    // 장소 목록이 처음 들어왔을 때 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.places]);

  const requestDetailGoogle = data.requestDetailGoogle;
  useEffect(() => { requestDetailGoogle(map.detailPlace); }, [requestDetailGoogle, map.detailPlace]);
  const requestDetails = data.requestDetails;
  useEffect(() => { if (map.detailPlace) requestDetails(); }, [requestDetails, map.detailPlace]);

  const pickRandom = () => {
    if (!search.filtered.length) return;
    map.handleDetail(search.filtered[Math.floor(Math.random() * search.filtered.length)]);
  };

  const emptyHint = (() => {
    if (search.emptyReason === 'near') {
      const distance = search.radius >= 1000 ? `${search.radius / 1000}km` : `${search.radius}m`;
      return `${search.near?.label ?? '선택한 위치'} ${distance} 안에 없습니다.`;
    }
    if (search.emptyReason === 'filters') return '적용한 필터가 모든 가게를 제외했습니다.';
    if (search.emptyReason === 'map') return '현재 지도 범위에는 결과가 없습니다.';
    if (search.emptyReason === 'search') return '다른 이름이나 메뉴로 검색해 보세요.';
    return undefined;
  })();

  const emptyActions: { label: string; onClick: () => void }[] = [];
  if (search.near && search.radius < 2000) emptyActions.push({ label: '반경 넓히기', onClick: search.widenRadius });
  if (search.activeFilters) emptyActions.push({ label: '필터 초기화', onClick: search.resetFilters });
  if (!search.near && search.scope === 'map') emptyActions.push({ label: '전체에서 보기', onClick: () => search.setScope('all') });
  if (search.textFilter.trim()) emptyActions.push({ label: '검색어 지우기', onClick: search.clearSearch });
  if (search.near) emptyActions.push({
    label: '전체에서 보기',
    onClick: () => { search.clearNear(); search.setScope('all'); },
  });

  const resetKey = [
    search.sort, search.textFilter, search.categories.join('|'), search.openOnly, search.minScore,
    search.unvisitedOnly, search.region.sido, search.region.sigungu, search.region.dong,
    search.near?.label ?? '', search.radius, search.scope, discovery.discover,
  ].join(',');

  return (
    <div className="h-[100svh] w-screen overflow-hidden relative bg-surface-sunken text-fg">
      <div className="absolute inset-0 isolate">
        {data.dataState === 'ready' && (
          <MapView
            places={data.places}
            ratings={data.ratings}
            means={data.means}
            showGoogle={data.googleReady}
            selectedCategories={search.categories}
            selectedPlace={map.selectedPlace}
            showPopup={layout.desktop && !map.detailPlace}
            numbered={search.numbered}
            onSelect={map.handleSelect}
            onDetail={map.handleDetail}
            onBoundsChange={map.handleViewChange}
            focus={search.focus}
            discovered={discovery.discovered}
            discoveredRatings={discovery.discoveredRatings}
            onDiscoveredOpen={discovery.onDiscoveredOpen}
            discoverFailed={discovery.discoverFailed}
            discoverUnavailable={discovery.discoverUnavailable}
            topOffset={layout.chipBarHeight}
            bottomInset={layout.bottomInset}
            // 목록 left-4+w-96 → 416, 상세 left-[416px]+w-[380px] → 796 (아래 aside 와 같이 바꿀 것)
            leftInset={layout.desktop ? (map.detailPlace ? 796 : 416) : 0}
            initialView={{ c: initial.c, z: initial.z }}
          />
        )}
      </div>

      {map.pendingDiffers && (
        <button
          type="button"
          onClick={map.applyPendingView}
          className="absolute z-30 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-surface-raised text-fg border border-line shadow-lg px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-surface-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          style={{ top: (layout.desktop ? layout.chipBarHeight : 0) + 16 }}
        >
          <MapPin className="w-4 h-4 text-primary-fg" aria-hidden="true" />
          이 지역에서 다시 찾기
          <span className="text-xs font-normal text-fg-muted tabular-nums">{map.pendingView?.length.toLocaleString()}곳</span>
        </button>
      )}

      {layout.desktop && (
        <div
          ref={layout.chipBarRef}
          className="absolute top-0 right-0 left-[416px] z-20 bg-surface/95 backdrop-blur-sm border-b border-line-subtle"
        >
          <CategoryBar available={search.available} selected={search.categories} onChange={search.setCategories} counts={search.counts} />
        </div>
      )}

      <ListPanel
        snap={layout.snap}
        onSnapChange={layout.setSnap}
        desktop={layout.desktop}
        title={
          <header className="px-3 pb-1.5 pt-1 shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-4 h-4 shrink-0 text-primary-fg" aria-hidden="true" />
              <span className="font-bold text-sm text-fg">맛핀</span>
              <span className="text-sm text-fg-muted truncate tabular-nums" aria-live="polite" aria-atomic="true">
                {search.filtered.length.toLocaleString()}곳
                {search.scope === 'all' && !search.near ? ' · 전체' : ''}
                {search.geocoding && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" aria-label="검색 중" />}
              </span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {installState === 'ready' && (
                <button
                  type="button"
                  data-nodrag
                  onClick={() => { void promptInstall(); }}
                  aria-label="맛핀을 앱으로 설치"
                  className="inline-flex items-center gap-1 h-8 px-2.5 mr-1 rounded-full bg-primary text-on-primary text-xs font-semibold hover:bg-primary-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />설치
                </button>
              )}
              <button
                type="button"
                data-nodrag
                onClick={pickRandom}
                aria-label="아무 곳이나 고르기"
                className="grid place-items-center w-11 h-11 rounded-lg text-fg-muted hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-nodrag
                onClick={() => setDataPanelOpen(true)}
                aria-label="데이터와 방문기록"
                className="grid place-items-center w-11 h-11 rounded-lg text-fg-muted hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
              >
                <Database className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-nodrag
                onClick={layout.toggleColorScheme}
                aria-label={layout.colorScheme === 'dark' ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기'}
                className="grid place-items-center w-11 h-11 rounded-lg text-fg-muted hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
              >
                {layout.colorScheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </header>
        }
      >
        {!layout.desktop && map.detailPlace ? (
          <PlaceSheet
            place={map.detailPlace}
            ratings={data.ratings[map.detailPlace.placeId]}
            details={data.details[map.detailPlace.placeId]}
            means={data.means}
            googleEnabled={GOOGLE_ENABLED}
            onClose={closeDetail}
            visit={visits[map.detailPlace.placeId]}
            onToggleVisit={toggleVisit}
            onNote={setNote}
            nav={detailNav}
          />
        ) : (
          <>
            <ListToolbar
              query={search.query}
              onQueryChange={search.handleQueryChange}
              onSubmit={search.runSearch}
              scope={search.scope}
              onScopeChange={search.setScope}
              nearLabel={search.near?.label ?? null}
              radius={search.radius}
              onRadiusChange={search.setRadius}
              onClearNear={search.clearNear}
              openOnly={search.openOnly}
              onOpenOnlyChange={search.setOpenOnly}
              openOnlyAvailable={search.hasHours}
              minScore={search.minScore}
              onMinScoreChange={search.setMinScore}
              sort={search.sort}
              onSortChange={search.setSort}
              canSortDistance={search.canSortDistance}
              discover={discovery.discover}
              onDiscoverChange={discovery.setDiscover}
              unvisitedOnly={search.unvisitedOnly}
              onUnvisitedOnlyChange={search.setUnvisitedOnly}
              follow={map.follow}
              onFollowChange={map.setFollow}
              onPickNow={search.pickNow}
              regionOpen={search.regionOpen}
              onRegionOpenChange={search.setRegionOpen}
              regionLabel={regionLabelOf(search.region)}
              total={data.places.length}
              alwaysExpanded={layout.desktop}
            >
              {!layout.desktop && (
                <div className="-mx-3">
                  <CategoryBar
                    available={search.available}
                    selected={search.categories}
                    onChange={search.setCategories}
                    counts={search.counts}
                  />
                </div>
              )}
            </ListToolbar>

            {search.regionOpen && (
              <RegionPicker
                places={data.places}
                sido={search.region.sido}
                sigungu={search.region.sigungu}
                dong={search.region.dong}
                onChange={search.setRegion}
              />
            )}

            {search.searchNotice && (
              <p
                className="shrink-0 m-0 px-3 py-2 text-xs text-[var(--matpin-closing)] bg-surface-fill border-b border-line-subtle"
                role="status"
                aria-live="polite"
              >
                {search.searchNotice}
              </p>
            )}

            {search.outsideCount > 0 && (
              <p className="shrink-0 m-0 px-3 py-2 text-xs text-fg-muted bg-surface-fill border-b border-line-subtle flex items-center justify-between gap-2">
                <span>지도 밖에 {search.outsideCount.toLocaleString()}곳 더 있습니다</span>
                <button
                  type="button"
                  onClick={() => search.setScope('all')}
                  className="shrink-0 font-semibold text-primary-fg hover:underline min-h-11 px-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  전체에서 보기
                </button>
              </p>
            )}

            {data.dataState === 'loading' ? (
              <div className="flex-1 grid place-items-center" role="status">
                <Loader2 className="w-6 h-6 animate-spin text-primary-fg" aria-hidden="true" />
                <span className="sr-only">맛집 목록을 불러오는 중</span>
              </div>
            ) : data.dataState === 'error' ? (
              <div className="flex-1 grid place-items-center p-6 text-center" role="alert">
                <p className="text-sm text-fg-muted m-0">맛집 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>
              </div>
            ) : (
              <PlaceList
                places={search.filtered}
                ratings={data.ratings}
                means={data.means}
                showGoogle={data.googleReady}
                ratingsLoading={data.ratingsLoading}
                selectedPlaceId={map.selectedPlace?.placeId ?? null}
                pinned={!layout.desktop ? map.selectedPlace : null}
                onUnpin={() => map.setSelectedPlace(null)}
                autoScroll={layout.desktop}
                onRendered={data.requestGoogle}
                resetKey={resetKey}
                onSelect={map.handleSelect}
                onDetail={map.handleDetail}
                origin={search.distanceOrigin}
                visited={visitedIds}
                emptyHint={emptyHint}
                emptyActions={emptyActions}
              />
            )}

            {layout.desktop && data.withScore > 0 && !data.ratingsLoading && (
              <p className="shrink-0 px-3 py-1.5 m-0 text-xs text-fg-subtle border-t border-line-subtle tabular-nums">
                평점 수집 {data.withScore.toLocaleString()} / {data.places.length.toLocaleString()}곳
              </p>
            )}
          </>
        )}
      </ListPanel>

      {layout.desktop && map.detailPlace && (
        <aside
          className="absolute left-[416px] bottom-4 z-20 w-[380px] flex flex-col bg-surface shadow-2xl rounded-xl overflow-hidden"
          style={{ top: layout.chipBarHeight + 16 }}
        >
          <PlaceSheet
            place={map.detailPlace}
            ratings={data.ratings[map.detailPlace.placeId]}
            details={data.details[map.detailPlace.placeId]}
            means={data.means}
            googleEnabled={GOOGLE_ENABLED}
            onClose={closeDetail}
            visit={visits[map.detailPlace.placeId]}
            onToggleVisit={toggleVisit}
            onNote={setNote}
            nav={detailNav}
          />
        </aside>
      )}

      {!layout.desktop && layout.snap === 'peek' && (
        <button
          type="button"
          onClick={() => layout.setSnap('half')}
          className="absolute left-1/2 -translate-x-1/2 bottom-[104px] z-20 flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 rounded-full shadow-lg hover:bg-primary-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="font-bold text-sm tabular-nums">{search.filtered.length.toLocaleString()}곳</span>
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        </button>
      )}

      <DataPanel
        open={dataPanelOpen}
        onClose={() => setDataPanelOpen(false)}
        meta={data.metaState}
        visitCount={Object.keys(visits).length}
        onExport={exportJson}
        onImport={importJson}
      />
    </div>
  );
}
