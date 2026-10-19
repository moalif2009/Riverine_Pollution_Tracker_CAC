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

// Values stored in Firestore (don't rename; existing reports use them)
const STATUS_CLASSES = { 'Reported': 'reported', 'Sent to agency': 'sent', 'Resolved': 'resolved' };
const AGENCY_RIVERKEEPER = 'Chattahoochee Riverkeeper';
const AGENCY_311 = 'ATL311';
const AGENCY_EPD = 'Georgia EPD';
const RIVERKEEPER_EMAIL = 'info@chattahoochee.org';
const ATL311_URL = 'https://www.atl311.com';

const MOD_PASSCODE = "admin123";

let mapInstance = null;
let pinLayer = null;        // all saved reports
let draftMarker = null;     // the pin for the report being created
let accuracyCircle = null;  // GPS accuracy around the draft pin / user dot
let userDot = null;         // "you are here" dot when browsing
let reporting = false;      // true while the report form is open
let gpsRequestId = 0;       // bumped to ignore stale GPS results
let loadRequestId = 0;      // bumped to ignore stale pin loads
let reports = {};           // report data by Firestore id
let modUnlocked = false;

let selectedBase64 = null;
let selectedCoords = null;
let currentReport = null;

const $ = (id) => document.getElementById(id);
const sheet = $('sheet');
const reportForm = $('report-form');
const actionSection = $('action-section');
const reportBtn = $('reportBtn');
const photoInput = $('photoInput');
const photoPreview = $('photoPreview');
const photoPickerText = $('photoPickerText');
const locStatus = $('locStatus');
const confirmBtn = $('confirmBtn');

// ---------- Helpers ----------
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow image data URLs / https URLs into src and url()
function safeImageUrl(url) {
  if (typeof url !== 'string') return null;
  if (/^data:image\/(jpeg|jpg|png|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(url)) return url;
  if (/^https:\/\/[^\s"'()<>\\]+$/.test(url)) return url;
  return null;
}

function categoryLabel(value) {
  const match = CATEGORIES.find((c) => c.value === value);
  return match ? match.label : (value || TEXT.popupDefaultCategory);
}

function normalizeStatus(status) {
  return STATUS_CLASSES[status] ? status : 'Reported';
}

function formatDate(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return ts.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.idleText = button.textContent;
    if (busyText) button.textContent = busyText;
  } else if (button.dataset.idleText) {
    button.textContent = button.dataset.idleText;
  }
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function applyText() {
  document.querySelectorAll('[data-text]').forEach((el) => {
    el.textContent = TEXT[el.dataset.text];
  });
  document.querySelectorAll('[data-label]').forEach((el) => {
    el.setAttribute('aria-label', TEXT[el.dataset.label]);
    el.title = TEXT[el.dataset.label];
  });
  document.title = TEXT.appName;

  const select = $('pollutionCategory');
  CATEGORIES.forEach((c) => select.add(new Option(c.label, c.value)));
}

// ---------- Toasts & dialogs (instead of alert/prompt/confirm) ----------
function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' toast-' + type : '');
  toast.textContent = message;
  $('toasts').appendChild(toast);
  setTimeout(() => toast.classList.add('is-leaving'), 3500);
  setTimeout(() => toast.remove(), 3900);
}

// Resolves with the input value (password), true (confirmed), or null (cancelled).
// onConfirm(value) may return an error message to keep the dialog open.
function showDialog(opts) {
  const dialog = $('dialog');
  const form = $('dialogForm');
  const input = $('dialogInput');
  const textArea = $('dialogText');
  const error = $('dialogError');
  const confirm = $('dialogConfirm');
  const cancel = $('dialogCancel');

  $('dialogTitle').textContent = opts.title;
  $('dialogMessage').textContent = opts.message || '';
  $('dialogMessage').hidden = !opts.message;
  input.hidden = !opts.password;
  input.value = '';
  input.placeholder = opts.password || '';
  textArea.hidden = !opts.text;
  textArea.value = opts.text || '';
  error.hidden = true;
  confirm.textContent = opts.confirmText || TEXT.continue;
  confirm.className = opts.danger ? 'danger-btn' : 'primary-btn';
  cancel.textContent = opts.cancelText || TEXT.cancel;

  return new Promise((resolve) => {
    let busy = false;

    const finish = (value) => {
      form.removeEventListener('submit', onSubmit);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onEscape);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onSubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      const value = opts.password ? input.value : true;
      if (opts.onConfirm) {
        busy = true;
        setBusy(confirm, true);
        cancel.disabled = true;
        let message = null;
        try {
          message = await opts.onConfirm(value);
        } catch (err) {
          console.error(err);
          message = opts.errorText || TEXT.statusFailed;
        }
        busy = false;
        setBusy(confirm, false);
        cancel.disabled = false;
        if (message) {
          error.textContent = message;
          error.hidden = false;
          return;
        }
      }
      finish(value);
    };
    const onCancel = () => { if (!busy) finish(null); };
    const onEscape = (e) => { e.preventDefault(); onCancel(); };

    form.addEventListener('submit', onSubmit);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onEscape);
    dialog.showModal();
    if (opts.password) input.focus();
    else if (opts.text) textArea.select();
    else confirm.focus();
  });
}

// ---------- 1. Map (shown right away) ----------
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

  // Popup buttons (capture phase: Leaflet stops click bubbling inside popups)
  $('map').addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === 'take-action') openActionPanel(id);
    else if (button.dataset.action === 'resolve') resolveReport(id);
    else if (button.dataset.action === 'delete') deleteReport(id);
  }, true);
}

// Popups auto-pan clear of the open sheet. These options are read each time
// a popup opens, so they follow the sheet's current size.
function sheetPadding(corner) {
  if (sheet.hidden) return null;
  const rect = sheet.getBoundingClientRect();
  const mapRect = $('map').getBoundingClientRect();
  if (window.matchMedia('(min-width: 768px)').matches) {
    return corner === 'topLeft' ? [rect.right - mapRect.left + 10, 10] : null;
  }
  return corner === 'bottomRight' ? [10, mapRect.bottom - rect.top + 10] : null;
}
Object.defineProperties(L.Popup.prototype.options, {
  autoPanPaddingTopLeft: { get: () => sheetPadding('topLeft') },
  autoPanPaddingBottomRight: { get: () => sheetPadding('bottomRight') }
});

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

// ---------- 2. Report flow: open sheet, try GPS, let the user adjust ----------
function openReportForm() {
  mapInstance.closePopup();
  currentReport = null;
  reporting = true;
  reportBtn.hidden = true;
  $('sheetTitle').textContent = TEXT.newReportTitle;
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
      html: `<div class="photo-pin photo-pin-draft" style="background-image: url('${escapeHtml(selectedBase64)}')"></div>`,
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
    draftMarker = L.marker(selectedCoords, { icon: draftIcon(), draggable: true, autoPan: true, zIndexOffset: 1000 })
      .addTo(mapInstance);
    draftMarker.on('dragend', () => {
      gpsRequestId++;
      selectedCoords = draftMarker.getLatLng();
      clearAccuracy();
      setLocStatus(TEXT.locCustom);
    });
  } else {
    draftMarker.setLatLng(selectedCoords);
  }

  clearAccuracy();
  if (accuracy) {
    accuracyCircle = L.circle(selectedCoords, { radius: accuracy, className: 'accuracy-circle', interactive: false })
      .addTo(mapInstance);
    setLocStatus(TEXT.locFound(Math.round(accuracy)));
  } else {
    gpsRequestId++; // a manual choice wins over any pending GPS fix
    setLocStatus(TEXT.locCustom);
  }
  updateConfirmState();
}

function setLocStatus(text, isError) {
  locStatus.textContent = text;
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
  const showError = (msg) => {
    if (reporting) setLocStatus(msg + ' ' + TEXT.locFallback, true);
    else showToast(msg, 'error');
  };

  if (!window.isSecureContext) return showError(TEXT.locInsecure);
  if (!navigator.geolocation) return showError(TEXT.locUnsupported);

  const requestId = ++gpsRequestId;
  const forReport = reporting;
  if (forReport) setLocStatus(TEXT.locFinding);
  $('locateBtn').classList.add('is-busy');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('locateBtn').classList.remove('is-busy');
      if (requestId !== gpsRequestId || forReport !== reporting) return;
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      const accuracy = pos.coords.accuracy;

      if (reporting) {
        placeDraftPin(latlng, accuracy);
      } else {
        clearUserDot();
        accuracyCircle = L.circle(latlng, { radius: accuracy, className: 'accuracy-circle', interactive: false })
          .addTo(mapInstance);
        userDot = L.circleMarker(latlng, { radius: 7, className: 'user-dot', interactive: false }).addTo(mapInstance);
      }
      focusOn(latlng);
    },
    (err) => {
      $('locateBtn').classList.remove('is-busy');
      if (requestId !== gpsRequestId || forReport !== reporting) return;
      if (err.code === 1) showError(TEXT.locDenied);
      else if (err.code === 2) showError(TEXT.locUnavailable);
      else if (err.code === 3) showError(TEXT.locTimeout);
      else showError(TEXT.locFailed);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

// ---------- 3. Photo: resize & compress ----------
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
      photoPickerText.textContent = TEXT.photoChange;
      if (draftMarker) draftMarker.setIcon(draftIcon());
      updateConfirmState();
    };
    img.src = uploadEvent.target.result;
  };
  reader.readAsDataURL(file);
});

function updateConfirmState() {
  if (confirmBtn.classList.contains('is-busy')) return;
  confirmBtn.disabled = !(selectedBase64 && selectedCoords);
}

// ---------- 4. Save Data & Category to Firestore Database ----------
async function confirmLocation() {
  if (!selectedCoords || !selectedBase64) return;

  const category = $('pollutionCategory').value;
  const cancelBtn = $('cancelBtn');

  setBusy(confirmBtn, true, TEXT.saving);
  cancelBtn.disabled = true;
  if (draftMarker) draftMarker.dragging.disable();

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
      category: category,
      status: 'Reported',
      sentTo: []
    };

    clearDraft();
    reporting = false;
    loadAllPins();
    showActionPanel(true);
  } catch (error) {
    console.error("Error saving report: ", error);
    showToast(TEXT.saveFailed, 'error');
    if (draftMarker) draftMarker.dragging.enable();
  } finally {
    setBusy(confirmBtn, false);
    cancelBtn.disabled = false;
    updateConfirmState();
  }
}

// ---------- 5. Load All Pins from Firestore ----------
function popupHtml(id, data) {
  const status = normalizeStatus(data.status);
  const statusClass = STATUS_CLASSES[status];
  const img = safeImageUrl(data.imageUrl);
  const sentTo = Array.isArray(data.sentTo) ? data.sentTo : [];
  const date = formatDate(data.createdAt);
  const safeId = escapeHtml(id);

  return `
    <div class="popup">
      ${img
        ? `<img class="popup-photo" src="${escapeHtml(img)}" alt="" />`
        : `<div class="popup-photo popup-photo-empty">${escapeHtml(TEXT.popupNoPhoto)}</div>`}
      <strong class="popup-title">${escapeHtml(categoryLabel(data.category))}</strong>
      <span class="status-chip status-${statusClass}">${escapeHtml(STATUS_LABELS[status])}</span>
      ${date ? `<p class="popup-meta">${escapeHtml(TEXT.popupReportedOn)} ${escapeHtml(date)}</p>` : ''}
      ${sentTo.length ? `<p class="popup-meta">${escapeHtml(TEXT.popupSentTo)}: ${escapeHtml(sentTo.join(', '))}</p>` : ''}
      <button class="primary-btn popup-action" type="button" data-action="take-action" data-id="${safeId}">${escapeHtml(TEXT.popupTakeAction)}</button>
      <div class="popup-mod">
        ${status !== 'Resolved'
          ? `<button class="link-btn" type="button" data-action="resolve" data-id="${safeId}">${escapeHtml(TEXT.popupResolve)}</button>`
          : ''}
        <button class="link-btn link-danger" type="button" data-action="delete" data-id="${safeId}">${escapeHtml(TEXT.popupDelete)}</button>
      </div>
    </div>
  `;
}

async function loadAllPins() {
  const requestId = ++loadRequestId;
  let querySnapshot;
  try {
    querySnapshot = await db.collection("reports").get();
  } catch (error) {
    console.error("Error loading reports: ", error);
    showToast(TEXT.loadFailed, 'error');
    return;
  }
  if (requestId !== loadRequestId) return; // a newer load is in progress

  pinLayer.clearLayers();
  reports = {};

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;

    reports[doc.id] = data;
    const status = normalizeStatus(data.status);
    const img = safeImageUrl(data.imageUrl);
    const imageStyle = img ? ` style="background-image: url('${escapeHtml(img)}')"` : '';

    const photoIcon = L.divIcon({
      className: 'custom-photo-pin',
      html: `<div class="photo-pin pin-${STATUS_CLASSES[status]}"${imageStyle}></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -18]
    });

    L.marker([lat, lng], { icon: photoIcon, title: categoryLabel(data.category) })
      .addTo(pinLayer)
      .bindPopup(popupHtml(doc.id, data), { maxWidth: 240, minWidth: 200 });
  });
}

// ---------- 6. Moderator actions ----------
// One dialog asks for the passcode (first time only) and confirms the action.
function moderatorDialog(opts) {
  return showDialog({
    title: opts.title,
    message: opts.message,
    confirmText: opts.confirmText,
    danger: opts.danger,
    password: modUnlocked ? null : TEXT.modPasscodePrompt,
    errorText: opts.errorText,
    onConfirm: async (value) => {
      if (!modUnlocked) {
        if (value !== MOD_PASSCODE) return TEXT.modPasscodeWrong;
        modUnlocked = true;
      }
      await opts.run();
    }
  });
}

async function deleteReport(docId) {
  const ok = await moderatorDialog({
    title: TEXT.deleteTitle,
    message: TEXT.deleteMessage,
    confirmText: TEXT.deleteConfirm,
    danger: true,
    errorText: TEXT.deleteFailed,
    run: () => db.collection("reports").doc(docId).delete()
  });
  if (!ok) return;

  mapInstance.closePopup();
  if (currentReport && currentReport.id === docId) resetApp();
  showToast(TEXT.deleted);
  loadAllPins();
}

async function resolveReport(docId) {
  const ok = await moderatorDialog({
    title: TEXT.resolveTitle,
    message: TEXT.resolveMessage,
    confirmText: TEXT.resolveConfirm,
    errorText: TEXT.resolveFailed,
    run: () => db.collection("reports").doc(docId).update({ status: 'Resolved' })
  });
  if (!ok) return;

  mapInstance.closePopup();
  if (currentReport && currentReport.id === docId) currentReport.status = 'Resolved';
  showToast(TEXT.resolved);
  loadAllPins();
}

// ---------- 7. Reset App State ----------
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
  photoPickerText.textContent = TEXT.photoPick;
  selectedBase64 = null;
  selectedCoords = null;
  setLocStatus(TEXT.locIdle);
  updateConfirmState();
}

function resetApp() {
  clearDraft();
  reporting = false;
  currentReport = null;
  sheet.hidden = true;
  reportBtn.hidden = false;
}

// ---------- 8. Take action panel & sending to agencies ----------
function showActionPanel(isNew) {
  $('sheetTitle').textContent = TEXT.actionTitle;
  $('actionIntro').textContent = isNew ? TEXT.actionIntroNew : TEXT.actionIntroExisting;
  $('actionSummary').textContent =
    categoryLabel(currentReport.category) + ' · ' + STATUS_LABELS[normalizeStatus(currentReport.status)];
  updateSentTo();
  reportForm.hidden = true;
  actionSection.hidden = false;
  reportBtn.hidden = true;
  sheet.hidden = false;
}

function updateSentTo() {
  const line = $('actionSentTo');
  const sentTo = currentReport.sentTo || [];
  line.hidden = !sentTo.length;
  line.textContent = TEXT.alreadySentTo + ' ' + sentTo.join(', ');
}

async function openActionPanel(id) {
  const data = reports[id];
  if (!data) return;

  // Don't silently throw away a report someone is in the middle of
  if (reporting && selectedBase64) {
    const discard = await showDialog({
      title: TEXT.discardTitle,
      message: TEXT.discardMessage,
      confirmText: TEXT.discardConfirm,
      danger: true
    });
    if (!discard) return;
  }

  clearDraft();
  reporting = false;
  mapInstance.closePopup();
  currentReport = {
    id: id,
    lat: Number(data.lat),
    lng: Number(data.lng),
    category: data.category || TEXT.popupDefaultCategory,
    status: normalizeStatus(data.status),
    sentTo: Array.isArray(data.sentTo) ? data.sentTo.slice() : []
  };
  showActionPanel(false);
}

function reportText(r) {
  return TEXT.reportBody(r);
}

function sendToRiverkeeper() {
  if (!currentReport) return;
  const subject = encodeURIComponent(TEXT.reportEmailSubject(currentReport.category));
  const body = encodeURIComponent(reportText(currentReport));
  window.location.href = `mailto:${RIVERKEEPER_EMAIL}?subject=${subject}&body=${body}`;
  markSent(AGENCY_RIVERKEEPER);
}

// Works on plain http too, where navigator.clipboard is undefined
function copyText(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'visually-hidden';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    ok = false;
  }
  area.remove();
  if (!ok && navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => {});
    ok = true;
  }
  return ok;
}

async function sendTo311() {
  if (!currentReport) return;
  const report = currentReport;
  const text = reportText(report);

  if (copyText(text)) {
    // Open in the same click so popup blockers allow it
    window.open(ATL311_URL, '_blank', 'noopener');
    showToast(TEXT.copied311);
  } else {
    // Fallback: show the text so they can copy it manually
    const go = await showDialog({
      title: TEXT.copyManualTitle,
      message: TEXT.copyManualMessage,
      text: text,
      confirmText: TEXT.open311
    });
    if (!go) return;
    window.open(ATL311_URL, '_blank', 'noopener');
  }
  markSent(AGENCY_311, report);
}

async function markSent(agency, report) {
  report = report || currentReport;
  if (!report) return;

  const update = { sentTo: firebase.firestore.FieldValue.arrayUnion(agency) };
  // Don't move a resolved report back to "Sent to agency"
  if (report.status !== 'Resolved') update.status = 'Sent to agency';

  try {
    await db.collection('reports').doc(report.id).update(update);
    if (update.status) report.status = update.status;
    if (!report.sentTo.includes(agency)) report.sentTo.push(agency);
    if (report === currentReport) {
      updateSentTo();
      $('actionSummary').textContent =
        categoryLabel(report.category) + ' · ' + STATUS_LABELS[normalizeStatus(report.status)];
    }
    showToast(TEXT.markedSent(agency));
    loadAllPins();
  } catch (e) {
    console.error('Could not update status:', e);
    showToast(TEXT.statusFailed, 'error');
  }
}

// ---------- 9. Wire up controls ----------
applyText();
setLocStatus(TEXT.locIdle);

reportBtn.addEventListener('click', openReportForm);
$('closeSheetBtn').addEventListener('click', resetApp);
$('cancelBtn').addEventListener('click', resetApp);
$('doneBtn').addEventListener('click', resetApp);
$('useLocationBtn').addEventListener('click', locateUser);
$('locateBtn').addEventListener('click', locateUser);
$('riverkeeperBtn').addEventListener('click', sendToRiverkeeper);
$('atl311Btn').addEventListener('click', sendTo311);
$('epdBtn').addEventListener('click', () => markSent(AGENCY_EPD));
confirmBtn.addEventListener('click', confirmLocation);

initMap();
