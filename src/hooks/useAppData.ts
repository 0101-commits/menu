import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetailsMap, GoogleRating, Place, RatingsMap } from '../types';
import type { MetaState } from '../lib/meta';
import { loadDetails, loadMeta, loadPlaces, loadRatings } from '../lib/data';
import { computeMeans, rawOf } from '../lib/rating';
import { GOOGLE_ENABLED, fetchGoogleByIds, fetchRatings } from '../lib/worker';

export function useAppData() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [baseRatings, setBaseRatings] = useState<RatingsMap>({});
  const [googleById, setGoogleById] = useState<Record<string, GoogleRating>>({});
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const [metaState, setMetaState] = useState<MetaState>({ status: 'loading', data: null });

  useEffect(() => {
    let alive = true;
    loadPlaces()
      .then((value) => { if (alive) { setPlaces(value); setDataState('ready'); } })
      .catch(() => { if (alive) setDataState('error'); });
    loadRatings()
      .then((value) => { if (alive) setBaseRatings(value); })
      .finally(() => { if (alive) setRatingsLoading(false); });
    loadMeta()
      .then((data) => { if (alive) setMetaState({ status: 'ready', data }); })
      .catch(() => { if (alive) setMetaState({ status: 'error', data: null }); });
    return () => { alive = false; };
  }, []);

  const ratings = useMemo(() => {
    if (!Object.keys(googleById).length) return baseRatings;
    const next: RatingsMap = { ...baseRatings };
    for (const [placeId, google] of Object.entries(googleById)) {
      next[placeId] = { ...next[placeId], google: next[placeId]?.google ?? google };
    }
    return next;
  }, [baseRatings, googleById]);

  const askedGoogle = useRef(new Set<string>());
  const requestGoogle = useCallback((batch: Place[]) => {
    if (!GOOGLE_ENABLED) return;
    const fresh = batch.filter((place) => place.googlePlaceId && !askedGoogle.current.has(place.googlePlaceId));
    if (!fresh.length) return;
    for (const place of fresh) askedGoogle.current.add(place.googlePlaceId!);
    void fetchGoogleByIds(fresh.map((place) => place.googlePlaceId!)).then((got) => {
      if (!Object.keys(got).length) return;
      setGoogleById((prev) => {
        const next = { ...prev };
        for (const place of fresh) {
          const value = got[place.googlePlaceId!];
          if (value) next[place.placeId] = value;
        }
        return next;
      });
    });
  }, []);

  // 상세 온디맨드 값도 KV에 합쳐진다. 영구 시드 값을 기본으로 쓰고, Worker는 낡은 값을
  // 본 순간 뒤에서 일부 갱신한다. 실패분은 캐시하지 않아 다음 상세 열기에서 재시도한다.
  const requestDetailGoogle = useCallback((place: Place | null) => {
    if (!GOOGLE_ENABLED || !place?.googlePlaceId || ratings[place.placeId]?.google) return;
    const placeId = place.placeId;
    void fetchRatings({ g: place.googlePlaceId })
      .then((result) => {
        if (!result.google) return;
        setBaseRatings((prev) => ({ ...prev, [placeId]: { ...prev[placeId], google: result.google } }));
      })
      .catch(() => undefined);
  }, [ratings]);

  // 상세를 처음 열 때 한 번만 받는다. 첫 화면에는 필요 없다.
  const [details, setDetails] = useState<DetailsMap>({});
  const askedDetails = useRef(false);
  const requestDetails = useCallback(() => {
    if (askedDetails.current) return;
    askedDetails.current = true;
    // 못 받았으면(오프라인 등) 다음에 상세를 열 때 다시 받는다. 없어도 상세는 열린다.
    void loadDetails().then(setDetails).catch(() => { askedDetails.current = false; });
  }, []);

  const means = useMemo(() => computeMeans(ratings), [ratings]);
  const googleReady = Boolean(Object.keys(googleById).length);
  const withScore = useMemo(
    () => Object.values(ratings).filter((rating) => rawOf(rating, 'naver') || rawOf(rating, 'kakao')).length,
    [ratings],
  );

  return {
    places, ratings, means, dataState, ratingsLoading, metaState,
    googleReady, withScore, requestGoogle, requestDetailGoogle, details, requestDetails,
  };
}
