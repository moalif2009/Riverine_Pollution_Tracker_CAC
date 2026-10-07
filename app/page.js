'use client';

import { useState } from 'react';

export default function PhotoUploader() {
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [coords, setCoords] = useState(null);
  const [locError, setLocError] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  function chosenPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    event.target.value = "";
    setCoords(null);
    setLocError(null);

    if (!navigator.geolocation) {
      setLocError("Location is not supported by your browser.");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          setLocError("Location permission denied.");
        } else if (err.code === 2) {
          setLocError("Location could not be determined. Need a clearer view.");
        } else if (err.code === 3) {
          setLocError("Location request timed out. Please try again.");
        } else {
          setLocError("Something went wrong getting location.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  return (
    <div className="wrap">
      <h1>Photo & Location Tracker</h1>

      <label className="shootButton">
        Take / Upload Photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={chosenPhoto}
          style={{ display: 'none' }}
        />
      </label>

      {previewUrl && (
        <div className="result">
          <img src={previewUrl} alt="Preview" />
        </div>
      )}

      {isLocating && <p className="meta">Finding Location...</p>}

      {coords && (
        <p className="meta">
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} ({Math.round(coords.accuracy)}m accuracy)
        </p>
      )}

      {locError && <p className="meta error">{locError}</p>}
    </div>
  );
}
