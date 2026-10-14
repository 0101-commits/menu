// 가게 하나를 자세히 본다. 모바일에서는 바텀시트, 데스크톱에서는 패널 안에 들어간다.
//
// 카드가 "비교" 를 맡으므로 여기서는 "판단에 필요한 나머지" 를 편다.
// 소스별 표본 크기를 막대로 같이 보여 주는 이유는, 점수 차이가 표본 차이에서
// 오는 것인지 실제 평가 차이인지 숫자만으로는 안 보이기 때문이다.

import { useEffect, useRef } from 'react';
import { X, Clock, UtensilsCrossed, Tag, CalendarCheck, Navigation, Check, Sparkles, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Place, PlaceDetails, Ratings } from '../types';
import { BrandDot, brandName, type Brand } from './BrandDot';
import { PlaceLinks } from './PlaceLinks';
import { colorOf } from '../lib/categories';
import { agoLabel, formatCount, formatPrice, formatScore, rankLabel, rawOf, scoreLabel, summarize, type SourceMeans } from '../lib/rating';
import { openStatus, todayIndex, seoulDay, seoulHour, splitBreak } from '../lib/hours';

interface Props {
  place: Place;
  ratings?: Ratings;
  details?: PlaceDetails;
  means: SourceMeans;
  googleEnabled: boolean;
  onClose: () => void;
  visit?: { at: string; note?: string };
  onToggleVisit: (placeId: string) => void;
  onNote: (placeId: string, note: string) => void;
  /** 목록 안에서 이전·다음 가게로. 목록에 없는 가게(지도에서 바로 고른 것 등)면 없다. */
  nav?: { onPrev?: () => void; onNext?: () => void; position: string };
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 이만큼 옆으로 밀어야 넘어간다. 세로 스크롤 중 손가락이 조금 비껴가는 것과 가르기 위함. */
const SWIPE_PX = 60;

const ICON_BUTTON =
  'grid place-items-center w-11 h-11 shrink-0 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-pressed transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

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

/**
 * 시간대별 방문 막대. 카카오가 주는 값은 일주일 평균(weekly_uv_average)이고 단위가 모호해서(방문자 수 추정),
 * 숫자 대신 가장 붐비는 때와의 비율만 그린다. 지금 시각 막대만 진하게.
 */
function BusyChart({ busy }: { busy: NonNullable<PlaceDetails['busy']> }) {
  const hour = seoulHour();
  const peak = busy.from + busy.v.indexOf(Math.max(...busy.v));
  const nowValue = busy.v[hour - busy.from];
  const summary = `가장 붐비는 때 ${peak}시${nowValue != null ? ` · 지금 ${hour}시는 그때의 ${nowValue}%` : ''}`;
  // 막대가 12개를 넘으면 시각 글자가 겹친다. 3시간마다만 적는다.
  const labelEvery = busy.v.length > 12 ? 3 : 1;
  return (
    <Section icon={<Users className="w-3.5 h-3.5" />} title="언제 붐비나요">
      {/* 막대는 눈으로 보는 용도. 같은 내용을 아래 글로도 적는다. */}
      <div aria-hidden="true" className="flex items-end gap-0.5 h-12">
        {busy.v.map((v, i) => (
          <span
            key={i}
            title={`${busy.from + i}시`}
            className={`flex-1 rounded-t-sm ${busy.from + i === hour ? 'bg-primary' : 'bg-line-strong'}`}
            style={{ height: `${v ? Math.max(v, 4) : 0}%` }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-0.5 mt-1 text-[10px] leading-none text-fg-subtle tabular-nums">
        {busy.v.map((_, i) => (
          <span key={i} className="flex-1 text-center">{(busy.from + i) % labelEvery === 0 ? busy.from + i : ''}</span>
        ))}
      </div>
      <p className="m-0 mt-2 text-xs text-fg-muted">{summary}</p>
      <p className="m-0 mt-0.5 text-xs text-fg-subtle">카카오맵 방문 통계 · 일주일 평균</p>
    </Section>
  );
}

export function PlaceSheet({
  place, ratings, details, means, googleEnabled, onClose, visit, onToggleVisit, onNote, nav,
}: Props) {
  // 좌우로 밀어 목록의 이전·다음 가게로(카카오맵 6.28 「장소 패널 좌우 넘기기」).
  // 밀리는 동안 본문을 손가락을 따라 조금 움직여 넘어간다는 걸 보여 준다 — 매 움직임마다
  // 다시 그리지 않도록 상태 대신 ref 와 style 을 직접 만진다.
  const swipe = useRef<{ x: number; y: number; dx: number; axis: 'x' | 'y' | null } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    // 메모 칸 안에서 글자를 고르는 손짓은 넘기기가 아니다.
    const typing = (e.target as HTMLElement).closest('textarea, input');
    swipe.current = nav && e.touches.length === 1 && !typing
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, axis: null }
      : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    // 처음 10px 로 방향을 정하고 그 뒤로는 바꾸지 않는다. 대각선이면 세로(스크롤)로 본다.
    if (!s.axis && Math.hypot(dx, dy) > 10) s.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    if (s.axis !== 'x') return;
    s.dx = dx;
    if (body.current) body.current.style.transform = `translateX(${dx * 0.4}px)`;
  };
  const onTouchEnd = () => {
    const s = swipe.current;
    onTouchCancel();
    if (s?.axis !== 'x' || Math.abs(s.dx) < SWIPE_PX) return;
    if (s.dx < 0) nav?.onNext?.();
    else nav?.onPrev?.();
  };
  // 시스템이 손가락을 가져가면(안드로이드 가장자리 뒤로 가기 등) 넘기지 않고 제자리로만.
  const onTouchCancel = () => {
    swipe.current = null;
    if (body.current) body.current.style.transform = '';
  };

  // 메모는 칸을 떠날 때(onBlur) 저장한다. 그런데 칸에 커서가 있는 채로 가게가 바뀌거나 상세가 닫히면
  // blur 없이 칸이 사라질 수 있다 — 쓰던 글을 들고 있다가 그때 저장한다.
  const draft = useRef<{ placeId: string; note: string } | null>(null);
  const saveNote = useRef(onNote);
  saveNote.current = onNote;
  useEffect(() => () => {
    const d = draft.current;
    draft.current = null;
    if (d) saveNote.current(d.placeId, d.note);
  }, [place.placeId]);

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
    <div
      className="flex flex-col h-full overflow-hidden touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
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
        <div className="flex items-center -mr-2 -mt-1 shrink-0">
          {/* 밀어 넘기기는 손가락 전용이라 같은 일을 하는 버튼을 둔다(키보드·마우스·보조기술). */}
          {nav && (
            <>
              <button type="button" onClick={nav.onPrev} disabled={!nav.onPrev} aria-label={`이전 가게 (${nav.position})`} className={ICON_BUTTON}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" onClick={nav.onNext} disabled={!nav.onNext} aria-label={`다음 가게 (${nav.position})`} className={ICON_BUTTON}>
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
          <button type="button" onClick={onClose} aria-label="닫기" className={ICON_BUTTON}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 가게가 바뀌면 본문을 새로 띄운다 — 스크롤을 맨 위로, 메모 칸도 그 가게 것으로. */}
      <div key={place.placeId} ref={body} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
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
            /* 귀속 표시는 의무다(Places 정책). 자체 제작 'G' 배지는 로고도 텍스트도 아니라
               여기에 "Google Maps" 를 그대로 적고 그 지도로 가는 길을 함께 둔다.
               수집 시각을 같이 적는 이유: 값을 무기한 보관하고 오래된 것부터 갱신하므로,
               지금 보는 숫자가 며칠 전 것인지 사용자가 알아야 한다. */
            <p className="m-0 mt-2 text-xs text-fg-subtle">
              평점 출처 Google Maps
              {ratings.google.at ? ` · ${agoLabel(ratings.google.at)} 기준` : ''}
              {place.googlePlaceId && (
                <>
                  {' · '}
                  <a
                    href={`https://www.google.com/maps/place/?q=place_id:${place.googlePlaceId}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline hover:text-fg"
                  >
                    Google 지도에서 보기
                  </a>
                </>
              )}
            </p>
          )}
        </div>

        {details?.ai && (
          // 출처와 주의 문구 없이는 띄우지 않는다(기획 D2). 리뷰를 기계가 요약한 문장이다.
          <Section icon={<Sparkles className="w-3.5 h-3.5" />} title="한 줄 요약">
            <p className="m-0 text-sm font-semibold text-fg">{details.ai.title}</p>
            {details.ai.points.length ? (
              <ul className="m-0 mt-2 p-0 list-none flex flex-wrap gap-1.5">
                {details.ai.points.map((point) => (
                  <li key={point} className="text-xs bg-surface-fill text-fg-muted px-2 py-1 rounded-full">{point}</li>
                ))}
              </ul>
            ) : null}
            <p className="m-0 mt-2 text-xs text-fg-subtle">카카오 AI 요약 · 리뷰를 AI가 요약한 것이라 사실과 다를 수 있습니다</p>
          </Section>
        )}

        {ratings?.hours?.length ? (
          <Section icon={<Clock className="w-3.5 h-3.5" />} title="영업시간">
            {status.text && (
              <p className={`m-0 mb-1.5 text-sm font-medium ${status.state === 'break' ? 'text-[var(--matpin-closing)]' : 'text-fg'}`}>
                {status.text}
              </p>
            )}
            <ul className="m-0 p-0 list-none grid gap-0.5">
              {ratings.hours.map((h, i) => {
                const { span, breaks } = splitBreak(h.trim());
                return (
                  <li key={i} className="flex gap-3 text-xs">
                    <span className={`w-6 shrink-0 ${i === todayCell ? 'font-bold text-fg' : 'text-fg-muted'}`}>
                      {DAYS[(baseDay + i) % 7]}
                    </span>
                    <span className={`tabular-nums ${span ? (i === todayCell ? 'text-fg' : 'text-fg-muted') : 'text-fg-subtle'}`}>
                      {span || '휴무'}
                      {breaks && <span className="text-fg-subtle"> · 브레이크 {breaks}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {details?.busy && <BusyChart busy={details.busy} />}

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
                onChange={(e) => { draft.current = { placeId: place.placeId, note: e.target.value }; }}
                onBlur={(e) => { draft.current = null; onNote(place.placeId, e.target.value); }}
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
