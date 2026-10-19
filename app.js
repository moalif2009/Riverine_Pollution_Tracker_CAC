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

// Default view: the Chattahoochee through metro Atlanta
const DEFAULT_CENTER = [33.82, -84.43];
const DEFAULT_ZOOM = 11;
const PIN_ZOOM = 16;

let mapInstance = null;
let pinLayer = null;        // all saved reports
let draftMarker = null;     // the pin for the report being created
let accuracyCircle = null;  // GPS accuracy around the draft pin / user dot
let userDot = null;         // "you are here" dot when browsing
let reporting = false;      // true while the report sheet is open
let gpsRequestId = 0;       // bumped to ignore stale GPS results

let selectedBase64 = null;
let selectedCoords = null;
let currentReport = null;

const sheet = document.getElementById('sheet');
const sheetTitle = document.getElementById('sheetTitle');
const reportForm = document.getElementById('report-form');
const actionSection = document.getElementById('action-section');
const reportBtn = document.getElementById('reportBtn');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
const photoPickerText = document.getElementById('photoPickerText');
const locStatus = document.getElementById('locStatus');
const confirmBtn = document.getElementById('confirmBtn');

// 1. Map (shown right away)
function initMap() {
  mapInstance = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.control.zoom({ position: 'topright' }).addTo(mapInstance);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);

  pinLayer = L.layerGroup().addTo(mapInstance);
  loadAllPins();

  // While reporting, tapping the map picks a custom spot
  mapInstance.on('click', (event) => {
    if (!reporting) return;
    placeDraftPin(event.latlng, null);
  });
}

// Center on a point, keeping it clear of the open sheet
function focusOn(latlng, zoom) {
  const z = zoom || Math.max(mapInstance.getZoom(), PIN_ZOOM);
  let offset = L.point(0, 0);

  if (!sheet.hidden) {
    const rect = sheet.getBoundingClientRect();
    if (window.matchMedia('(min-width: 768px)').matches) {
      offset = L.point(-rect.width / 2, 0);   // side panel on the left
    } else {
      offset = L.point(0, rect.height / 2);   // bottom sheet
    }
  }

  const target = mapInstance.project(latlng, z).add(offset);
  mapInstance.setView(mapInstance.unproject(target, z), z);
}

// 2. Report flow: open sheet, try GPS, let the user adjust
function openReportForm() {
  reporting = true;
  reportBtn.hidden = true;
  sheetTitle.innerText = 'New report';
  reportForm.hidden = false;
  actionSection.hidden = true;
  sheet.hidden = false;
  clearUserDot();
  locateUser();
}

function draftIcon() {
  if (selectedBase64) {
    return L.divIcon({
      className: 'custom-photo-pin',
      html: `<div class="photo-pin photo-pin-draft" style="background-image: url('${selectedBase64}')"></div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });
  }
  return L.divIcon({
    className: 'custom-photo-pin',
    html: '<div class="draft-pin"></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

// accuracy is set for GPS fixes; null means the user picked the spot
function placeDraftPin(latlng, accuracy) {
  selectedCoords = L.latLng(latlng);

  if (!draftMarker) {
    draftMarker = L.marker(selectedCoords, { icon: draftIcon(), draggable: true, autoPan: true })
      .addTo(mapInstance);
    draftMarker.on('dragend', () => {
      gpsRequestId++;
      selectedCoords = draftMarker.getLatLng();
      clearAccuracy();
      setLocStatus('Custom spot selected. Drag the pin to adjust.');
    });
  } else {
    draftMarker.setLatLng(selectedCoords);
  }

  clearAccuracy();
  if (accuracy) {
    accuracyCircle = L.circle(selectedCoords, { radius: accuracy, className: 'accuracy-circle', interactive: false })
      .addTo(mapInstance);
    setLocStatus(`Using your location (±${Math.round(accuracy)} m). Drag the pin or tap the map to adjust.`);
  } else {
    gpsRequestId++; // a manual choice wins over any pending GPS fix
    setLocStatus('Custom spot selected. Drag the pin to adjust.');
  }
  updateConfirmState();
}

function setLocStatus(text, isError) {
  locStatus.innerText = text;
  locStatus.classList.toggle('is-error', !!isError);
}

function clearAccuracy() {
  if (accuracyCircle) {
    mapInstance.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }
}

function clearUserDot() {
  if (userDot) {
    mapInstance.removeLayer(userDot);
    userDot = null;
  }
  clearAccuracy();
}

// GPS (needs https or localhost)
function locateUser() {
  const fallback = reporting ? ' Tap the map to place the pin.' : '';

  if (!window.isSecureContext || !navigator.geolocation) {
    const msg = !window.isSecureContext
      ? 'Location only works on a secure (https) page.'
      : 'Location is not supported by this browser.';
    if (reporting) setLocStatus(msg + fallback, true);
    else alert(msg);
    return;
  }

  const requestId = ++gpsRequestId;
  const forReport = reporting;
  if (forReport) setLocStatus('Finding your location…');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (requestId !== gpsRequestId || forReport !== reporting) return;
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      const accuracy = pos.coords.accuracy;

      if (reporting) {
        placeDraftPin(latlng, accuracy);
      } else {
        clearUserDot();
        accuracyCircle = L.circle(latlng, { radius: accuracy, className: 'accuracy-circle', interactive: false })
          .addTo(mapInstance);
        userDot = L.circleMarker(latlng, { radius: 7, className: 'user-dot' }).addTo(mapInstance);
      }
      focusOn(latlng);
    },
    (err) => {
      if (requestId !== gpsRequestId || forReport !== reporting) return;
      let msg;
      if (err.code === 1) msg = 'Location permission denied.';
      else if (err.code === 2) msg = 'Location could not be determined.';
      else if (err.code === 3) msg = 'Location request timed out.';
      else msg = 'Something went wrong getting your location.';
      if (reporting) setLocStatus(msg + fallback, true);
      else alert(msg);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

// 3. Photo: resize & compress
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

      photoPreview.src = selectedBase64;
      photoPreview.hidden = false;
      photoPickerText.innerText = 'Change photo';
      if (draftMarker) draftMarker.setIcon(draftIcon());
      updateConfirmState();
    };
    img.src = uploadEvent.target.result;
  };
  reader.readAsDataURL(file);
});

function updateConfirmState() {
  confirmBtn.disabled = !(selectedBase64 && selectedCoords);
}

// 4. Save Data & Category to Firestore Database
async function confirmLocation() {
  if (!selectedCoords || !selectedBase64) return;

  const category = document.getElementById('pollutionCategory').value;

  confirmBtn.innerText = "Saving…";
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

    clearDraft();
    loadAllPins();

    // Show the "Take action" panel
    reporting = false;
    sheetTitle.innerText = 'Take action';
    reportForm.hidden = true;
    actionSection.hidden = false;
  } catch (error) {
    console.error("Error saving report: ", error);
    alert("Failed to save. Check your Firestore rules.");
  } finally {
    confirmBtn.innerText = "Submit report";
    updateConfirmState();
  }
}

// 5. Load All Pins from Firestore
function loadAllPins() {
  db.collection("reports").get().then((querySnapshot) => {
    pinLayer.clearLayers();
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
        .addTo(pinLayer)
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

// 6. Moderator Deletion Logic
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

// 7. Reset App State
function clearDraft() {
  gpsRequestId++;
  if (draftMarker) {
    mapInstance.removeLayer(draftMarker);
    draftMarker = null;
  }
  clearAccuracy();
  photoInput.value = '';
  photoPreview.hidden = true;
  photoPreview.removeAttribute('src');
  photoPickerText.innerText = 'Take or choose a photo';
  selectedBase64 = null;
  selectedCoords = null;
  updateConfirmState();
}

function resetApp() {
  clearDraft();
  reporting = false;
  currentReport = null;
  sheet.hidden = true;
  reportBtn.hidden = false;
  setLocStatus('Tap the map to place the pin.');
}

// 8. Send to Agencies
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

// 9. Wire up controls
reportBtn.addEventListener('click', openReportForm);
document.getElementById('closeSheetBtn').addEventListener('click', resetApp);
document.getElementById('cancelBtn').addEventListener('click', resetApp);
document.getElementById('doneBtn').addEventListener('click', resetApp);
document.getElementById('useLocationBtn').addEventListener('click', locateUser);
document.getElementById('locateBtn').addEventListener('click', locateUser);
confirmBtn.addEventListener('click', confirmLocation);

initMap();
