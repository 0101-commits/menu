// 가게 하나를 자세히 본다. 모바일에서는 바텀시트, 데스크톱에서는 패널 안에 들어간다.
//
// 카드가 "비교" 를 맡으므로 여기서는 "판단에 필요한 나머지" 를 편다.
// 소스별 표본 크기를 막대로 같이 보여 주는 이유는, 점수 차이가 표본 차이에서
// 오는 것인지 실제 평가 차이인지 숫자만으로는 안 보이기 때문이다.

import { X, Clock, UtensilsCrossed, Tag, CalendarCheck, Navigation, Check } from 'lucide-react';
import type { Place, Ratings } from '../types';
import { BrandDot, brandName, type Brand } from './BrandDot';
import { PlaceLinks } from './PlaceLinks';
import { colorOf } from '../lib/categories';
import { formatCount, formatPrice, formatScore, rankLabel, rawOf, scoreLabel, summarize, type SourceMeans } from '../lib/rating';
import { openStatus, todayIndex, seoulDay } from '../lib/hours';

interface Props {
  place: Place;
  ratings?: Ratings;
  means: SourceMeans;
  googleEnabled: boolean;
  onClose: () => void;
  visit?: { at: string; note?: string };
  onToggleVisit: (placeId: string) => void;
  onNote: (placeId: string, note: string) => void;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="pt-3 mt-3 border-t border-line-subtle">
      <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg-muted m-0 mb-2">
        <span aria-hidden="true" className="text-fg-subtle">{icon}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

export function PlaceSheet({
  place, ratings, means, googleEnabled, onClose, visit, onToggleVisit, onNote,
}: Props) {
  const k = ratings?.kakao;
  const n = ratings?.naver;
  const sum = summarize(ratings, means);
  const status = openStatus(ratings?.hours, undefined, ratings?.hoursDay);
  const price = formatPrice(k?.price);
  const rank = rankLabel(k?.rank);

  const rows = (['naver', 'kakao', 'google'] as Brand[]).map((b) => ({ brand: b, raw: rawOf(ratings, b) }));
  const maxN = Math.max(1, ...rows.map((r) => r.raw?.n ?? 0));

  // 배열의 0번은 오늘이 아니라 수집한 날이다. 요일 이름은 수집 요일부터 붙이고,
  // 굵게 표시할 "오늘" 은 며칠 어긋났는지 계산해 찾는다.
  const now = new Date();
  const baseDay = ratings?.hoursDay ?? seoulDay(now);
  const todayCell = todayIndex(ratings?.hoursDay, now);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="px-4 pt-3 pb-3 shrink-0 flex items-start justify-between gap-2 border-b border-line-subtle">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(place.category) }} />
            <h3 className="font-bold text-lg text-fg m-0 truncate">{place.name}</h3>
          </div>
          <p className="mt-1 m-0 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
            <span className="bg-surface-fill px-2 py-0.5 rounded-full font-medium">{place.category}</span>
            {place.mcidName && place.mcidName !== place.category && <span>{place.mcidName}</span>}
            {price && <span className="tabular-nums tracking-[0.22em]">· {price}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid place-items-center w-11 h-11 -mr-2 -mt-1 shrink-0 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
        {rank && (
          <p className="m-0 mb-3 inline-block text-xs font-medium text-primary-fg bg-primary-weak px-2.5 py-1 rounded-full">
            {rank}
          </p>
        )}

        {/* 평점 비교 */}
        <div className="rounded-xl border border-line bg-surface-fill/50 p-3">
          <div className="flex items-baseline justify-between gap-2 mb-2.5">
            <span className="text-xs font-bold text-fg-muted">평점 비교</span>
            {sum.combined != null && (
              <span className="text-xs text-fg-subtle">
                {scoreLabel(sum)} <span className="font-bold text-fg tabular-nums">{sum.combined.toFixed(1)}</span>
                <span className="ml-1">· 신뢰 {sum.confidence === 'high' ? '높음' : '낮음'}</span>
              </span>
            )}
          </div>

          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {rows.map(({ brand, raw }) => (
              <li key={brand} className="flex items-center gap-2">
                <BrandDot brand={brand} size={18} />
                <span className="text-xs text-fg-muted w-11 shrink-0">{brandName(brand)}</span>
                <span className="text-sm font-semibold tabular-nums w-9 shrink-0 text-fg">
                  {formatScore(raw?.score ?? null)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block h-1.5 rounded-full bg-surface-fill overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-line-strong"
                      style={{ width: `${((raw?.n ?? 0) / maxN) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="text-xs text-fg-subtle tabular-nums w-14 text-right shrink-0">
                  {raw ? formatCount(raw.n) : '—'}
                </span>
              </li>
            ))}
          </ul>

          {/* 블로그 리뷰는 별점과 다른 성격이라 막대에 섞지 않고 따로 적는다. */}
          {(n?.blogs || k?.blogs) ? (
            <p className="m-0 mt-2.5 text-xs text-fg-subtle tabular-nums">
              블로그 리뷰
              {n?.blogs ? ` · 네이버 ${formatCount(n.blogs)}` : ''}
              {k?.blogs ? ` · 카카오 ${formatCount(k.blogs)}` : ''}
            </p>
          ) : null}

          {sum.caution && (
            <p className="m-0 mt-2 text-xs text-[var(--matpin-closing)]">{sum.caution}</p>
          )}
          {/* 네이버는 점수를 내려주면서도 자기 화면에는 안 띄우는 가게가 있다(업주 설정).
              값은 현재값이고 계속 갱신되지만, 네이버에서 찾아봐도 안 보이니 그렇다고 적어 둔다. */}
          {n?.scoreHidden && n.score != null && (
            <p className="m-0 mt-2 text-xs text-fg-subtle">네이버 점수는 네이버 화면에 공개되지 않는 가게입니다</p>
          )}
          {googleEnabled && ratings?.google && (
            <p className="m-0 mt-2 text-xs text-fg-subtle">구글 평점 제공: Google</p>
          )}
        </div>

        {ratings?.hours?.length ? (
          <Section icon={<Clock className="w-3.5 h-3.5" />} title="영업시간">
            {status.text && (
              <p className="m-0 mb-1.5 text-sm font-medium text-fg">{status.text}</p>
            )}
            <ul className="m-0 p-0 list-none grid gap-0.5">
              {ratings.hours.map((h, i) => (
                <li key={i} className="flex gap-3 text-xs">
                  <span className={`w-6 shrink-0 ${i === todayCell ? 'font-bold text-fg' : 'text-fg-muted'}`}>
                    {DAYS[(baseDay + i) % 7]}
                  </span>
                  <span className={`tabular-nums ${h.trim() ? (i === todayCell ? 'text-fg' : 'text-fg-muted') : 'text-fg-subtle'}`}>
                    {h.trim() || '휴무'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {ratings?.menus?.length ? (
          <Section icon={<UtensilsCrossed className="w-3.5 h-3.5" />} title="대표 메뉴">
            <ul className="m-0 p-0 list-none grid gap-1">
              {ratings.menus.map((m, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-fg truncate">{m.name}</span>
                  <span className="text-fg-muted tabular-nums shrink-0">
                    {m.price ? `${m.price.toLocaleString()}원` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {n?.keywords?.length ? (
          // 네이버가 별점 대신 쓰는 키워드 리뷰. 몇 명이 골랐는지까지 있어야 의미가 산다.
          <Section icon={<Tag className="w-3.5 h-3.5" />} title="방문자가 고른 점">
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
              {n.keywords.map((w) => (
                <li
                  key={w.t}
                  className="flex items-baseline gap-1 text-xs bg-surface-fill text-fg-muted px-2 py-1 rounded-full"
                >
                  {w.t}
                  <span className="text-fg-subtle tabular-nums">{formatCount(w.n)}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section icon={<Navigation className="w-3.5 h-3.5" />} title="위치">
          <p className="m-0 text-sm text-fg-muted">{place.address}</p>
        </Section>

        {/* 방문 기록은 이 브라우저에만 남는다. 네이버 즐겨찾기는 읽기만 하기 때문이다. */}
        <Section icon={<Check className="w-3.5 h-3.5" />} title="내 기록">
          <button
            type="button"
            onClick={() => onToggleVisit(place.placeId)}
            aria-pressed={Boolean(visit)}
            className={`flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-medium border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              visit
                ? 'bg-primary-weak text-primary-fg border-primary'
                : 'bg-surface text-fg-muted border-line hover:bg-surface-pressed'
            }`}
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            {visit ? `가봤음 · ${visit.at.slice(0, 10)}` : '가봤어요'}
          </button>

          {visit && (
            <>
              <label className="sr-only" htmlFor={`note-${place.placeId}`}>메모</label>
              <textarea
                id={`note-${place.placeId}`}
                defaultValue={visit.note ?? ''}
                onBlur={(e) => onNote(place.placeId, e.target.value)}
                placeholder="다음에 뭘 시킬지, 누구와 갔는지"
                rows={2}
                className="mt-2 w-full text-sm rounded-lg p-2 bg-surface text-fg border border-line resize-y focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </>
          )}
        </Section>

        <div className="mt-4 flex flex-col gap-2">
          <PlaceLinks place={place} />
          {n?.booking && (
            <a
              href={n.booking}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 min-h-11 rounded-lg bg-primary text-on-primary font-semibold text-sm hover:bg-primary-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <CalendarCheck className="w-4 h-4" aria-hidden="true" />
              네이버로 예약
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
