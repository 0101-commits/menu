import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPlace = vi.hoisted(() => ({
  id: 1, name: '테스트 식당', category: '한식', folder: '한식', mcidName: '한식',
  placeId: '1', lat: 37.5, lng: 127, address: '서울특별시 강남구 역삼동',
  naverUrl: 'https://m.place.naver.com/restaurant/1', sido: '서울특별시', sigungu: '강남구', dong: '역삼동',
}));

vi.mock('./components/MapView', () => ({ MapView: () => <div data-testid="map">지도</div> }));
vi.mock('./components/CategoryBar', () => ({ CategoryBar: () => null }));
vi.mock('./components/RegionPicker', () => ({
  RegionPicker: () => null,
  regionLabelOf: () => null,
}));
vi.mock('./components/ListToolbar', () => ({
  ListToolbar: (props: { query: string; onQueryChange: (value: string) => void; onSubmit: () => void }) => (
    <form onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }} role="search">
      <label htmlFor="test-search">장소·가게·메뉴 검색</label>
      <input id="test-search" type="search" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
    </form>
  ),
}));
vi.mock('./lib/data', () => ({
  loadPlaces: vi.fn(async () => [mockPlace]),
  loadRatings: vi.fn(async () => ({ '1': { naver: { score: 4.5, visitors: 10, blogs: 0 } } })),
  loadMeta: vi.fn(async () => ({
    version: 1,
    generatedAt: '2026-09-21T00:00:00.000Z',
    places: { total: 1, withKakaoId: 0, withGoogleId: 0 },
    ratings: { total: 1, withNaver: 1, withKakao: 0, withGoogle: 0, withHours: 0, withMenus: 0 },
  })),
  listSignature: (items: { placeId: string }[]) => items.map((item) => item.placeId).join(','),
}));

import App from './App';

describe('App integration', () => {
  beforeEach(() => window.history.replaceState({}, '', '/menu/'));

  it('장소를 로드하고 데이터 패널을 연다', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('테스트 식당')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '데이터와 방문기록' }));
    expect(screen.getByRole('dialog', { name: '데이터와 내 기록' })).toBeInTheDocument();
  });

  it('검색 결과 0건에서 검색어를 지워 회복한다', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('테스트 식당')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: '장소·가게·메뉴 검색' }), '없는가게');
    expect(await screen.findByText('찾는 맛집이 없습니다', {}, { timeout: 1500 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    await waitFor(() => expect(screen.getByText('테스트 식당')).toBeInTheDocument());
  });
});
