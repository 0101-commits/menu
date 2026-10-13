import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { place } from '../test/fixtures';

vi.mock('../lib/data', () => ({
  loadPlaces: vi.fn(),
  loadRatings: vi.fn(),
  loadMeta: vi.fn(),
}));
vi.mock('../lib/worker', () => ({
  GOOGLE_ENABLED: false,
  fetchGoogleByIds: vi.fn(async () => ({})),
  fetchRatings: vi.fn(async () => ({})),
}));

import { loadMeta, loadPlaces, loadRatings } from '../lib/data';
import { useAppData } from './useAppData';

const meta = {
  version: 1 as const,
  generatedAt: '2026-09-21T00:00:00.000Z',
  places: { total: 1, withKakaoId: 0, withGoogleId: 0 },
  ratings: { total: 1, withNaver: 1, withKakao: 0, withGoogle: 0, withHours: 0, withMenus: 0 },
};

describe('useAppData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('장소가 먼저 준비되고 평점은 뒤에 안전하게 합류한다', async () => {
    vi.mocked(loadPlaces).mockResolvedValue([place({ placeId: '1' })]);
    vi.mocked(loadRatings).mockResolvedValue({ '1': { naver: { score: 4.5, visitors: 10, blogs: 0 } } });
    vi.mocked(loadMeta).mockResolvedValue(meta);
    const { result } = renderHook(() => useAppData());
    expect(result.current.dataState).toBe('loading');
    await waitFor(() => expect(result.current.dataState).toBe('ready'));
    await waitFor(() => expect(result.current.ratingsLoading).toBe(false));
    expect(result.current.places).toHaveLength(1);
    expect(result.current.ratings['1'].naver?.score).toBe(4.5);
    expect(result.current.metaState.status).toBe('ready');
  });
});
