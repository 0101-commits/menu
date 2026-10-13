import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { useMapState } from './useMapState';
import { place } from '../test/fixtures';
import type { Snap } from '../components/ListPanel';

const first = place({ placeId: '1', id: 1 });

function useHarness(desktop = false, initialPlace?: string) {
  const [snap, setSnap] = useState<Snap>('peek');
  const map = useMapState({
    initial: { place: initialPlace }, places: [first], desktop, snap, setSnap,
  });
  return { ...map, snap };
}

describe('useMapState', () => {
  it('URL의 place를 선택과 상세로 복원한다', async () => {
    const { result } = renderHook(() => useHarness(false, '1'));
    await waitFor(() => expect(result.current.detailPlace?.placeId).toBe('1'));
    expect(result.current.selectedPlace?.placeId).toBe('1');
  });

  it('초기 URL 상세를 닫아도 다시 열리지 않는다', async () => {
    const { result } = renderHook(() => useHarness(false, '1'));
    await waitFor(() => expect(result.current.detailPlace?.placeId).toBe('1'));
    act(() => result.current.setDetailPlace(null));
    expect(result.current.detailPlace).toBeNull();
  });

  it('모바일 마커 선택은 상세 대신 half 선택 카드 상태로 간다', () => {
    const { result } = renderHook(() => useHarness(false));
    act(() => result.current.handleSelect(first));
    expect(result.current.selectedPlace).toEqual(first);
    expect(result.current.detailPlace).toBeNull();
    expect(result.current.snap).toBe('half');
  });

  it('데스크톱 마커 선택은 한 번에 상세를 연다', () => {
    const { result } = renderHook(() => useHarness(true));
    act(() => result.current.handleSelect(first));
    expect(result.current.detailPlace).toEqual(first);
  });
});
