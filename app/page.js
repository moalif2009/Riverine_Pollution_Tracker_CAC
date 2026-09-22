const[coord,setCoords] = useState(null);
const[locError,setLocError] = useState(null);

function chosenPhoto(event)
{
    const file = event.target.files[0];

    if (!file) return;

    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    event.target.value="";
    setCoords(null);
    setLocError(null);

    if (!navigator.geolocation)
    {
        setLocError("We cannot support location here.")
        return;
    }

    navigator.getCurrentPosition(
        pos =>
        {
            setCoords
            ({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,

            })
        },

    (err) => 
    {
        if (err.code === 1) {
            setLocError("Location Permission denied.");
        }

        else if (err.code === 2) {
            setLocError("Location could not be determined. Need clearer view");
        }

        else if (err.code === 3) {
            setLocError("Location timed out. Please retake again");
        }

        else {
            setLocError("Something went wrong getting location");
        }
    },

    {
    enableHighAccuracy: true,
    timeout: 150000,
    maximumAge: 0,
    }
  );
}

{coord&& (
    <p className = "meta">
        {coord.mat.toFixed(5)},{coord.lng.toFixed(5)}

    {Math.round(coord.accuracy)}m
    </p>
)}

{!coord && !locError && <p className="meta">Finding Location</p>}

{locError && <p className = "Meta Error">{locError}</p>}