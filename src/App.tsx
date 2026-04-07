import { useState } from 'react';
import { MapView } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { places, Place } from './data/places';
import { MapPin } from 'lucide-react';

function App() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const handlePlaceClick = (place: Place) => {
    setSelectedPlace(place);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col lg:flex-row">
      <div className="lg:absolute lg:left-4 lg:top-4 lg:bottom-4 lg:w-96 lg:z-10 h-64 lg:h-auto">
        <PlaceList
          places={places}
          onPlaceClick={handlePlaceClick}
          selectedPlaceId={selectedPlace?.id || null}
        />
      </div>

      <div className="flex-1 relative">
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg lg:block hidden">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-gray-900">나만의 맛집 평점 지도</span>
          </div>
        </div>

        <MapView
          places={places}
          selectedPlace={selectedPlace}
          onMarkerClick={handlePlaceClick}
        />
      </div>
    </div>
  );
}

export default App;