// ==========================================
// YOUR FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyB-1NCjWQQWjtzfyMdUFplhYHsw9dHZCKQ",
  authDomain: "cleanly-ca8c5.firebaseapp.com",
  projectId: "cleanly-ca8c5",
  storageBucket: "cleanly-ca8c5.firebasestorage.app",
  messagingSenderId: "293838772615",
  appId: "1:293838772615:web:22cb309094990371425b22",
  measurementId: "G-R2VYSJ7GNN"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const analytics = firebase.analytics();

let mapInstance = null;
let selectedBase64 = null;
let tempMarker = null;
let selectedCoords = null;
let currentReport = null;

const uploadSection = document.getElementById('upload-section');
const mapSection = document.getElementById('map-section');
const photoInput = document.getElementById('photoInput');
const instruction = document.getElementById('instruction');
const confirmBtn = document.getElementById('confirmBtn');

// 1. Listen for Image Selection, Resize, & Compress
photoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(uploadEvent) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 600;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      selectedBase64 = canvas.toDataURL('image/jpeg', 0.7);

      uploadSection.style.display = 'none';
      mapSection.style.display = 'block';

      initMap();
    };
    img.src = uploadEvent.target.result;
  };
  reader.readAsDataURL(file);
});

// 2. Initialize Leaflet Map
function initMap() {
  if (mapInstance) {
    mapInstance.invalidateSize();
    loadAllPins();
    return;
  }

  mapInstance = L.map('map').setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);

  loadAllPins();

  mapInstance.on('click', (event) => {
    selectedCoords = event.latlng;

    if (tempMarker) {
      mapInstance.removeLayer(tempMarker);
    }

    const photoIcon = L.divIcon({
      className: 'custom-photo-pin',
      html: `
        <div style="
          background-image: url('${selectedBase64}');
          width: 48px;
          height: 48px;
          background-size: cover;
          background-position: center;
          border-radius: 50%;
          border: 3px solid #1f6feb;
          box-shadow: 0 4px 12px rgba(0,0,0,0.6);
        "></div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    tempMarker = L.marker([selectedCoords.lat, selectedCoords.lng], { icon: photoIcon }).addTo(mapInstance);

    instruction.innerText = '📍 Pin placed! Click elsewhere to adjust, or hit Confirm.';
    confirmBtn.style.display = 'block';
  });
}

// 3. Save Data & Category to Firestore Database
async function confirmLocation() {
  if (!selectedCoords || !selectedBase64) return;

  const category = document.getElementById('pollutionCategory').value;

  confirmBtn.innerText = "Saving to DB...";
  confirmBtn.disabled = true;

  try {
    const docRef = await db.collection("reports").add({
      lat: selectedCoords.lat,
      lng: selectedCoords.lng,
      imageUrl: selectedBase64,
      category: category,
      status: "Reported",
      sentTo: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Remember this report so the agency buttons know what to send
    currentReport = {
      id: docRef.id,
      lat: selectedCoords.lat,
      lng: selectedCoords.lng,
      category: category
    };

    // Show the "Take action" panel instead of resetting
    mapSection.style.display = 'none';
    document.getElementById('action-section').style.display = 'block';
  } catch (error) {
    console.error("Error saving report: ", error);
    alert("Failed to save. Check your Firestore rules.");
  } finally {
    confirmBtn.innerText = "Confirm Location ✅";
    confirmBtn.disabled = false;
  }
}

// 4. Load All Pins from Firestore
function loadAllPins() {
  db.collection("reports").get().then((querySnapshot) => {
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const docId = doc.id;

      const borderColor =
        data.status === "Resolved" ? "#238636" :
        data.status === "Sent to agency" ? "#d29922" :
        "#da3633";

      const photoIcon = L.divIcon({
        className: 'custom-photo-pin',
        html: `
          <div style="
            background-image: url('${data.imageUrl}');
            width: 40px;
            height: 40px;
            background-size: cover;
            background-position: center;
            border-radius: 50%;
            border: 3px solid ${borderColor};
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          "></div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      L.marker([data.lat, data.lng], { icon: photoIcon })
        .addTo(mapInstance)
        .bindPopup(`
          <div style="text-align: center; padding: 4px;">
            <img src="${data.imageUrl}" style="width: 140px; border-radius: 6px; margin-bottom: 6px;" />
            <br /><strong>${data.category || 'Pollution Report'}</strong>
            <br /><span style="font-size:0.75rem; background: #30363d; padding: 2px 6px; border-radius: 4px;">Status: ${data.status || 'Reported'}</span>
            <br /><button class="delete-btn" onclick="deleteReport('${docId}')">🗑️ Remove Pin (Mod)</button>
          </div>
        `);
    });
  });
}

// 5. Moderator Deletion Logic
async function deleteReport(docId) {
  const passcode = prompt("Enter moderator passcode:");
  if (passcode !== "admin123") {
    if (passcode !== null) alert("Incorrect passcode.");
    return;
  }

  if (!confirm("Permanently delete this report?")) return;

  try {
    await db.collection("reports").doc(docId).delete();
    alert("Report deleted.");
    location.reload();
  } catch (error) {
    console.error("Error deleting: ", error);
    alert("Failed to delete.");
  }
}

// 6. Reset App State
function resetApp() {
  if (tempMarker && mapInstance) {
    mapInstance.removeLayer(tempMarker);
    tempMarker = null;
  }
  photoInput.value = '';
  selectedBase64 = null;
  selectedCoords = null;
  confirmBtn.style.display = 'none';
  mapSection.style.display = 'none';
  uploadSection.style.display = 'block';
  instruction.innerText = '👇 Click anywhere on the map to place your pin.';
  if (mapInstance) loadAllPins();
  document.getElementById('action-section').style.display = 'none';
  currentReport = null;
}

// 7. Send to Agencies
function reportText(r) {
  return `Pollution report: ${r.category}\n` +
         `Location: ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}\n` +
         `Map: https://www.google.com/maps?q=${r.lat},${r.lng}\n\n` +
         `Submitted through the Riverine Pollution Tracker.`;
}

function sendToRiverkeeper() {
  if (!currentReport) return;
  const subject = encodeURIComponent('Pollution report: ' + currentReport.category);
  const body = encodeURIComponent(reportText(currentReport));
  window.location.href = `mailto:info@chattahoochee.org?subject=${subject}&body=${body}`;
  markSent('Chattahoochee Riverkeeper');
}

async function sendTo311() {
  if (!currentReport) return;
  try {
    await navigator.clipboard.writeText(reportText(currentReport));
    alert('Report copied! Paste it into the ATL311 form.');
  } catch (e) {
    alert(reportText(currentReport)); // fallback: show it so they can copy manually
  }
  window.open('https://www.atl311.com', '_blank');
  markSent('ATL311');
}

async function markSent(agency) {
  if (!currentReport) return;
  try {
    await db.collection('reports').doc(currentReport.id).update({
      status: 'Sent to agency',
      sentTo: firebase.firestore.FieldValue.arrayUnion(agency)
    });
  } catch (e) {
    console.error('Could not update status:', e);
  }
}
