import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useUrlSync } from './useUrlSync';
import { place } from '../test/fixtures';
import type { Place } from '../types';
import type { Snap } from '../components/ListPanel';

const first = place({ placeId: '1', id: 1 });

function useHarness() {
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [snap, setSnap] = useState<Snap>('half');
  const close = useUrlSync({
    initial: {}, places: [first], desktop: false, setSnap,
    detailPlace, setDetailPlace, setSelectedPlace,
    near: null, radius: 500, categories: [], textFilter: '', sort: 'rating',
    openOnly: false, minScore: null, scope: 'map', discover: false,
    mapCenter: null, mapLevel: null, follow: true,
    region: { sido: '', sigungu: '', dong: '' },
  });
  return { detailPlace, setDetailPlace, selectedPlace, snap, close };
}

describe('useUrlSync', () => {
  it('상세를 열 때 history pushState를 사용한다', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(useHarness);
    act(() => result.current.setDetailPlace(first));
    expect(push).toHaveBeenCalled();
    expect(window.location.search).toContain('place=1');
  });

  it('popstate에서 place가 없으면 상세을 닫고 half로 돌아간다', () => {
    const { result } = renderHook(useHarness);
    act(() => result.current.setDetailPlace(first));
    act(() => window.history.replaceState({}, '', '/menu/'));
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(result.current.detailPlace).toBeNull();
    expect(result.current.snap).toBe('half');
  });
});
