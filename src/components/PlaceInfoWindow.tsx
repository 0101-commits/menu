import { X } from 'lucide-react';
import { Place } from '../data/places';
import { PlaceLinks } from './PlaceLinks';

interface PlaceInfoWindowProps {
  place: Place;
  onClose: () => void;
}

export function PlaceInfoWindow({ place, onClose }: PlaceInfoWindowProps) {
  return (
    // 지도 타일은 카카오 SDK 가 그려서 다크 모드에서도 밝다.
    // 오버레이 배경은 불투명한 surface 로 고정해야 글자가 읽힌다.
    <div className="bg-surface-raised text-fg rounded-xl shadow-xl border border-line p-4 min-w-[280px] max-w-[320px]">
      <div className="flex justify-between items-start gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-bold text-lg text-fg">{place.name}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block px-2 py-0.5 text-xs bg-primary-weak text-primary-fg rounded-full font-medium">
              {place.category}
            </span>
            {place.mcidName && <span className="text-xs text-fg-subtle">{place.mcidName}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid place-items-center w-11 h-11 -mr-2 -mt-2 shrink-0 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <p className="text-sm text-fg-muted mb-3">{place.address}</p>
      <div className="pt-3 border-t border-line-subtle">
        <PlaceLinks place={place} />
      </div>
    </div>
  );
}
