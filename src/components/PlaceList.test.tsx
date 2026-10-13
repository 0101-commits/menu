import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlaceList } from './PlaceList';
import { means, place } from '../test/fixtures';

const selected = place({ placeId: '1', id: 1, name: '선택 가게' });
const baseProps = {
  ratings: {}, means, showGoogle: false, ratingsLoading: false,
  selectedPlaceId: null, onSelect: () => undefined, onDetail: () => undefined,
  origin: null, visited: new Set<string>(),
};

describe('PlaceList interaction', () => {
  it('빈 결과 원인과 회복 버튼을 제공한다', async () => {
    const user = userEvent.setup();
    const recover = vi.fn();
    render(<PlaceList {...baseProps} places={[]} emptyHint="필터가 모든 가게를 제외했습니다." emptyActions={[{ label: '필터 초기화', onClick: recover }]} />);
    expect(screen.getByRole('status')).toHaveTextContent('필터가 모든 가게를 제외했습니다.');
    await user.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(recover).toHaveBeenCalledOnce();
  });

  it('목록이 비어도 지도에서 고른 곳은 고정한다', () => {
    render(<PlaceList {...baseProps} places={[]} pinned={selected} onUnpin={() => undefined} />);
    expect(screen.getByText('지도에서 고른 곳')).toBeInTheDocument();
    expect(screen.getByText('선택 가게')).toBeInTheDocument();
  });
});
