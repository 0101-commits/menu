import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataPanel } from './DataPanel';

const meta = {
  status: 'ready' as const,
  data: {
    version: 1 as const,
    generatedAt: '2026-09-21T00:00:00.000Z',
    places: { total: 100, withKakaoId: 90, withGoogleId: 80 },
    ratings: { total: 95, withNaver: 90, withKakao: 70, withGoogle: 0, withHours: 60, withMenus: 50 },
  },
};

describe('DataPanel', () => {
  it('열렸을 때 데이터 상태와 방문기록 수를 읽을 수 있다', () => {
    render(<DataPanel open onClose={() => undefined} meta={meta} visitCount={3} onExport={() => undefined} onImport={() => ({ imported: 0, updated: 0, kept: 0, total: 0 })} />);
    expect(screen.getByRole('dialog', { name: '데이터와 내 기록' })).toBeInTheDocument();
    expect(screen.getByText('100곳')).toBeInTheDocument();
    expect(screen.getByText(/3개 기록/)).toBeInTheDocument();
  });

  it('내보내기와 가져오기 결과를 알린다', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const onImport = vi.fn(() => ({ imported: 1, updated: 2, kept: 3, total: 6 }));
    render(<DataPanel open onClose={() => undefined} meta={meta} visitCount={0} onExport={onExport} onImport={onImport} />);

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    expect(onExport).toHaveBeenCalledOnce();

    const input = screen.getByLabelText('가져오기');
    await user.upload(input, new File(['{}'], 'visits.json', { type: 'application/json' }));
    expect(onImport).toHaveBeenCalledWith('{}');
    expect(await screen.findByText(/새 기록 1개 · 갱신 2개 · 유지 3개/)).toBeInTheDocument();
  });
});
