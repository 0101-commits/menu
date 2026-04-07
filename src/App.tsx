import { useState } from 'react';
import { MapView } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { places, Place } from './data/places';
import { MapPin } from 'lucide-react';

export default function App() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [visiblePlaces, setVisiblePlaces] = useState<Place[]>(places);

  const handlePlaceClick = (place: Place) => {
    setSelectedPlace(place);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col lg:flex-row">
      {/* 사이드바 */}
      <div className="lg:absolute lg:left-4 lg:top-4 lg:bottom-4 lg:w-96 lg:z-10 lg:h-auto h-64 w-full">
        <PlaceList
          places={visiblePlaces}
          onPlaceClick={handlePlaceClick}
          selectedPlaceId={selectedPlace?.id ?? null}
        />
      </div>

      {/* 지도 */}
      <div className="flex-1 relative">
        {/* 타이틀 */}
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-200 lg:block hidden">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-gray-800 text-sm">나만의 맛집 평점 지도</span>
          </div>
        </div>

        <MapView
          places={places}
          selectedPlace={selectedPlace}
          onMarkerClick={handlePlaceClick}
          onBoundsChange={setVisiblePlaces}
        />
      </div>
    </div>
  );
}
