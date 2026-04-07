import { Place } from '../data/places';

interface PlaceListProps {
  places: Place[];
  onPlaceClick: (place: Place) => void;
  selectedPlaceId: number | null;
}

async function openKakaoPlace(place: Place) {
  try {
    const query = `${place.name} ${place.address}`;
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&x=${place.lng}&y=${place.lat}&radius=100`,
      { headers: { Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_API_KEY}` } }
    );
    const data = await res.json();
    if (data.documents?.length > 0) {
      window.open(`https://place.map.kakao.com/${data.documents[0].id}`, '_blank');
    } else {
      window.open(`https://map.kakao.com/?q=${encodeURIComponent(query)}`, '_blank');
    }
  } catch {
    window.open(`https://map.kakao.com/?q=${encodeURIComponent(place.name)}`, '_blank');
  }
}

export function PlaceList({ places, onPlaceClick, selectedPlaceId }: PlaceListProps) {
  return (
    <div className="h-full bg-white flex flex-col shadow-lg overflow-hidden lg:rounded-none">
      <div className="p-5 bg-blue-600 text-white shrink-0">
        <h2 className="text-2xl font-bold">맛집 리스트</h2>
        <p className="text-blue-100 text-sm mt-1">총 {places.length}개 장소</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {places.map((place) => (
          <div
            key={place.id}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedPlaceId === place.id
                ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500'
                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
            }`}
            onClick={() => onPlaceClick(place)}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-gray-900 text-lg">{place.name}</h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                {place.category}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-4">{place.address}</p>
            <div className="flex gap-2">
              <a
                href={place.naverUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 cursor-pointer transition-colors px-3 py-2 rounded-lg flex-1"
              >
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">N</span>
                </div>
                <span className="font-semibold text-gray-900 text-sm">{place.naverScore}</span>
              </a>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openKakaoPlace(place);
                }}
                className="flex items-center gap-1.5 bg-yellow-50 hover:bg-yellow-100 cursor-pointer transition-colors px-3 py-2 rounded-lg flex-1"
              >
                <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
                  <span className="text-gray-900 font-bold text-sm">K</span>
                </div>
                <span className="font-semibold text-gray-900 text-sm">카카오맵</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
