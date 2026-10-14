import type { Place } from '../../types';
import type { KakaoNS } from '../../lib/kakao';
import { colorOf } from '../../lib/categories';
import { markerTier, type MarkerTier } from '../../lib/map-geometry';
import type { KakaoObject } from './types';

// markerImages.ts 의 핀과 같은 경로(viewBox 24×34). 가까이서는 캔버스도 같은 핀을 그린다.
const PIN_PATH = 'M12 1C6.2 1 1.5 5.7 1.5 11.5c0 7.9 9.2 19.6 10.1 20.8.2.3.6.3.8 0C13.3 31.1 22.5 19.4 22.5 11.5 22.5 5.7 17.8 1 12 1z';
/** 화면 밖으로 미리 칠해 두는 폭(px). 이만큼 끌기 전에는 다시 칠하지 않는다. */
const MARGIN = 256;
/** 점 반지름과 흰 테두리 두께 */
const DOT: Record<Exclude<MarkerTier, 'pin'>, { r: number; line: number }> = {
  dot: { r: 7, line: 2 },
  dotSmall: { r: 5, line: 1.5 },
};
/** 손가락은 점보다 굵다. 점 바깥으로 이만큼까지는 그 점을 누른 것으로 본다. */
const TOUCH_SLOP = 8;

export interface DotLayer {
  setFilter(categories: string[]): void;
  /** 번호 핀·선택 핀처럼 카카오 마커로 따로 올린 가게. 캔버스에서는 빼야 두 번 그려지지 않는다. */
  setHidden(placeIds: Set<string>): void;
  /**
   * 그 좌표에 그려진 가게. 핀은 위에 보이는 하나, 점은 손가락 여유 안의 것을 가까운 순으로.
   * direct = 점·핀을 정확히 눌렀다(여럿이 걸려도 첫째를 고르면 된다).
   */
  hitTest(latLng: KakaoObject): { places: Place[]; direct: boolean };
}

/**
 * 저장한 가게 전부를 캔버스 한 장에 그린다 — 숫자 묶음 없이, 멀리서는 점·가까이서는 핀으로.
 *
 * 카카오 마커 4,084개를 DOM 으로 올리면 확대 한 단계마다 위치 계산이 수천 번 돌아 CPU 4배 감속에서
 * 1~2초씩 멈췄다(숫자 묶음 클러스터는 다시 묶느라 7~15초로 더 느렸다). 캔버스는 화면 근처 것만
 * 다시 칠하면 되고, 끄는 동안에는 지도 판과 함께 그냥 따라 움직인다.
 * 그리는 층은 graphicsLayer — 카카오 마커·말풍선(overlayLayer)보다 아래라 번호 핀이 점에 안 덮인다.
 */
export function createDotLayer(kakao: KakaoNS, map: KakaoObject, container: HTMLElement, places: Place[]): DotLayer {
  // 북쪽부터 칠해야 남쪽 핀이 위에 겹친다(카카오 마커와 같은 겹침 순서).
  const items = [...places]
    .sort((a, b) => b.lat - a.lat)
    .map((place) => {
      // 카카오 판 좌표는 레벨마다 WCONG 좌표의 1차식이다. WCONG 을 한 번만 구해 두고, 칠할 때는
      // 화면 기준점 둘로 식을 세워 곱셈으로 옮긴다 — SDK 좌표 변환을 가게마다 부르면 칠하기 한 번이
      // CPU 4배 감속에서 100~500ms 걸렸다. (화면 근처 오차 0.5px 이하, 400km 밖은 5px — 어차피 안 그린다)
      const latLng = new kakao.maps.LatLng(place.lat, place.lng);
      const coords = latLng.toCoords();
      return { place, latLng, cx: coords.getX() as number, cy: coords.getY() as number, color: colorOf(place.category), x: 0, y: 0, drawn: false };
    });
  const pin = new Path2D(PIN_PATH);
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.pointerEvents = 'none';
  const ctx = canvas.getContext('2d');
  let categories: string[] = [];
  let hidden = new Set<string>();
  let dirty = true;
  let frame = 0;
  let painted = { level: -1, left: 0, top: 0, width: 0, height: 0, refX: 0, refY: 0 };

  const paint = (projection: KakaoObject, left: number, top: number, width: number, height: number, level: number) => {
    if (!ctx) return;
    // 화소 수 상한 12M(아이폰 캔버스 한도 16.7M 아래). 큰 모니터 2배 화면에서 수십 MB 를 잡지 않게.
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12e6 / (width * height)));
    canvas.style.visibility = '';
    const pxW = Math.round(width * dpr);
    const pxH = Math.round(height * dpr);
    // 크기가 같으면 버퍼를 다시 잡지 않고 지우기만 한다(수백만 화소를 매번 새로 잡으면 그것만으로 느리다).
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#fff';
    // WCONG → 판 좌표 식. 기준점 = 화면 왼쪽 위 · 오른쪽 아래 모서리.
    const a = projection.coordsFromPoint(new kakao.maps.Point(left + MARGIN, top + MARGIN));
    const b = projection.coordsFromPoint(new kakao.maps.Point(left + width - MARGIN, top + height - MARGIN));
    const pa = projection.pointFromCoords(a);
    const pb = projection.pointFromCoords(b);
    const ca = a.toCoords();
    const cb = b.toCoords();
    const sx = (pb.x - pa.x) / (cb.getX() - ca.getX());
    const sy = (pb.y - pa.y) / (cb.getY() - ca.getY());
    const ox = pa.x - sx * ca.getX() - left;
    const oy = pa.y - sy * ca.getY() - top;
    const tier = markerTier(level);
    for (const item of items) {
      item.drawn = false;
      if (hidden.has(item.place.placeId)) continue;
      if (categories.length && !categories.includes(item.place.category)) continue;
      const x = sx * item.cx + ox;
      const y = sy * item.cy + oy;
      if (x < -16 || y < -16 || x > width + 16 || y > height + 40) continue;
      item.x = x;
      item.y = y;
      item.drawn = true;
      ctx.fillStyle = item.color;
      if (tier === 'pin') {
        ctx.save();
        ctx.translate(x - 12, y - 34);
        ctx.lineWidth = 2;
        ctx.fill(pin);
        ctx.stroke(pin);
        ctx.beginPath();
        ctx.arc(12, 11.5, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();
      } else {
        const { r, line } = DOT[tier];
        ctx.lineWidth = line;
        ctx.beginPath();
        ctx.arc(x, y, r - line / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    const ref = items.length ? projection.pointFromCoords(items[0].latLng) : { x: 0, y: 0 };
    painted = { level, left, top, width, height, refX: ref.x, refY: ref.y };
    dirty = false;
  };

  class Layer extends (kakao.maps.AbstractOverlay as { new (): KakaoObject }) {
    onAdd() {
      // graphicsLayer 는 문서에 없는 이름이다(SDK 4.5.29 기준 존재). 없어지면 마커 층에라도 깐다.
      const panels = this.getPanels();
      const panel: HTMLElement = panels.graphicsLayer ?? panels.overlayLayer;
      panel.insertBefore(canvas, panel.firstChild);
    }

    onRemove() {
      canvas.remove();
    }

    // 지도가 움직이거나 확대될 때마다 SDK 가 부른다(확대 한 번에도 여러 번). 한 프레임에 한 번만 칠한다.
    draw() {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; this.update(); });
    }

    // 칠해 둔 판이 아직 화면을 덮고 있으면 아무것도 안 한다.
    update() {
      const projection = this.getProjection();
      if (!projection) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      const center = projection.pointFromCoords(map.getCenter());
      const left = center.x - width / 2;
      const top = center.y - height / 2;
      const level = map.getLevel();
      // 확대·setCenter 뒤에는 판 좌표의 원점이 바뀐다. 기준 가게 하나의 판 좌표로 알아챈다.
      const ref = items.length ? projection.pointFromCoords(items[0].latLng) : { x: 0, y: 0 };
      const covered = !dirty
        && level === painted.level
        && Math.abs(ref.x - painted.refX) < 0.5
        && Math.abs(ref.y - painted.refY) < 0.5
        && left >= painted.left && top >= painted.top
        && left + width <= painted.left + painted.width
        && top + height <= painted.top + painted.height;
      if (covered) return;
      paint(projection, left - MARGIN, top - MARGIN, width + MARGIN * 2, height + MARGIN * 2, level);
    }
  }

  const layer = new Layer();
  layer.setMap(map);
  const redraw = () => { dirty = true; layer.draw(); };
  // SDK 는 손으로 끌 때 draw 를 부르지 않는다(애니메이션 이동·확대 끝에만). 중심이 바뀔 때마다 살펴본다 —
  // 칠해 둔 여백 안이면 update 가 바로 돌아가므로 프레임당 좌표 변환 두 번이면 끝난다.
  kakao.maps.event.addListener(map, 'center_changed', () => layer.draw());
  // 휠·버튼 확대 애니메이션 동안 SDK 는 자기 도형만 키운다. 캔버스는 옛 자리에 남아 어긋나 보이므로
  // 잠깐 숨기고, 새 레벨로 칠할 때 다시 보인다. idle 은 혹시 칠하기가 건너뛰어졌을 때의 안전망.
  kakao.maps.event.addListener(map, 'zoom_start', () => { canvas.style.visibility = 'hidden'; });
  kakao.maps.event.addListener(map, 'idle', () => { if (canvas.style.visibility) redraw(); });
  // 누른 자리를 맞춰 보기 전에, 미뤄 둔 칠하기가 있으면 먼저 끝낸다(확대 직후 판 좌표가 바뀌었을 수 있다).
  const flush = () => {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
    layer.update();
  };

  return {
    setFilter(next) { categories = next; redraw(); },
    setHidden(next) {
      // 지도를 멈출 때마다 같은 묶음이 다시 들어온다. 바뀐 게 없으면 다시 칠하지 않는다.
      if (next.size === hidden.size && [...next].every((id) => hidden.has(id))) return;
      hidden = next;
      redraw();
    },
    hitTest(latLng) {
      flush();
      const projection = layer.getProjection();
      if (!projection) return { places: [], direct: false };
      const point = projection.pointFromCoords(latLng);
      const x = point.x - painted.left;
      const y = point.y - painted.top;
      const tier = markerTier(painted.level);
      if (tier === 'pin') {
        // 핀 머리(그린 원 반지름 10.5 + 여유) 또는 꼬리. 겹치면 나중에 칠한(위에 보이는) 핀.
        let top: Place | null = null;
        for (const item of items) {
          if (!item.drawn) continue;
          const dx = x - item.x;
          const dy = y - (item.y - 22.5);
          if (dx * dx + dy * dy <= 12 * 12 || (Math.abs(dx) <= 5 && y >= item.y - 22 && y <= item.y + 2)) top = item.place;
        }
        return { places: top ? [top] : [], direct: !!top };
      }
      const { r } = DOT[tier];
      const reach = r + TOUCH_SLOP;
      const near: { place: Place; d: number }[] = [];
      for (const item of items) {
        if (!item.drawn) continue;
        const d = (x - item.x) ** 2 + (y - item.y) ** 2;
        if (d <= reach * reach) near.push({ place: item.place, d });
      }
      near.sort((a, b) => a.d - b.d);
      return { places: near.map((n) => n.place), direct: near.length > 0 && near[0].d <= r * r };
    },
  };
}
