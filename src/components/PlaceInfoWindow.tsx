import { Place } from '../data/places';

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

interface PlaceInfoWindowProps {
  place: Place;
  onClose: () => void;
}

export function PlaceInfoWindow({ place, onClose }: PlaceInfoWindowProps) {
  return (
    <div className="bg-white rounded-lg shadow-xl p-4 min-w-[280px] max-w-[320px]">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-bold text-lg text-gray-900">{place.name}</h3>
          <span className="inline-block mt-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
            {place.category}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mb-3">
        <p className="text-sm text-gray-600">{place.address}</p>
      </div>
      <div className="flex gap-2 pt-3 border-t border-gray-200">
        
          href={place.naverUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="네이버 지도로 보기"
          className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 cursor-pointer transition-colors px-3 py-2 rounded-lg flex-1"
        >
          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="font-semibold text-gray-900">{place.naverScore}</span>
        </a>
        <button
          onClick={() => openKakaoPlace(place)}
          title="카카오맵으로 보기"
          className="flex items-center gap-1.5 bg-yellow-50 hover:bg-yellow-100 cursor-pointer transition-colors px-3 py-2 rounded-lg flex-1"
        >
          <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
            <span className="text-gray-900 font-bold text-sm">K</span>
          </div>
          <span className="font-semibold text-gray-900">카카오맵</span>
        </button>
      </div>
    </div>
  );
}