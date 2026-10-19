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
const auth = firebase.auth();
const analytics = firebase.analytics();

// Default view: the Chattahoochee through metro Atlanta.
// If the visitor has already allowed location, the map starts where they are.
const DEFAULT_CENTER = [33.82, -84.43];
const DEFAULT_ZOOM = 11;
const PIN_ZOOM = 16;

// Values stored in Firestore (don't rename; existing reports use them)
const STATUS_CLASSES = { 'Reported': 'reported', 'Sent to agency': 'sent', 'Resolved': 'resolved' };
const STATUS_ICONS = { 'Reported': 'alert', 'Sent to agency': 'send', 'Resolved': 'check' };

let mapInstance = null;
let pinLayer = null;        // all saved reports
let draftMarker = null;     // the pin for the report being created
let accuracyCircle = null;  // GPS accuracy around the draft pin / user dot
let userDot = null;         // "you are here" dot when browsing
let reporting = false;      // true while the report form is open
let gpsRequestId = 0;       // bumped to ignore stale GPS results
let loadRequestId = 0;      // bumped to ignore stale pin loads
let reports = {};           // report data by Firestore id
let isModerator = false;   // signed in AND listed in the admins collection

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

// Icon from the SVG sprite in index.html
function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function statusBadge(status) {
  return `<span class="badge badge-${STATUS_CLASSES[status]}">${icon(STATUS_ICONS[status])}</span>`;
}

function sizeLabel(value) {
  const match = SIZES.find((size) => size.value === value);
  return match ? match.label : '';
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

  // Category dropdown, grouped (Water / Land / Air), with an empty first choice
  const select = $('pollutionCategory');
  select.add(placeholderOption(TEXT.categoryPlaceholder));
  CATEGORIES.forEach((c) => {
    let group = [...select.children].find((g) => g.label === c.group);
    if (!group) {
      group = document.createElement('optgroup');
      group.label = c.group;
      select.appendChild(group);
    }
    group.appendChild(new Option(c.label, c.value));
  });

  const sizeSelect = $('pollutionSize');
  sizeSelect.add(placeholderOption(TEXT.sizePlaceholder));
  SIZES.forEach((size) => sizeSelect.add(new Option(size.label, size.value)));
}

function placeholderOption(label) {
  const option = new Option(label, '', true, true);
  option.disabled = true;
  return option;
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

// Resolves with true (confirmed) or null (cancelled).
// onConfirm(value) may return an error message to keep the dialog open.
function showDialog(opts) {
  const dialog = $('dialog');
  const form = $('dialogForm');
  const textArea = $('dialogText');
  const error = $('dialogError');
  const confirm = $('dialogConfirm');
  const cancel = $('dialogCancel');

  $('dialogTitle').textContent = opts.title;
  $('dialogMessage').textContent = opts.message || '';
  $('dialogMessage').hidden = !opts.message;
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
      const value = true;
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
    if (opts.text) textArea.select();
    else confirm.focus();
  });
}

// ---------- 1. Map (shown right away) ----------
function initMap() {
  mapInstance = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

  // "Use my location" sits above the zoom buttons
  const LocateControl = L.Control.extend({
    onAdd: () => {
      const button = $('locateBtn');
      L.DomEvent.disableClickPropagation(button);
      return button;
    }
  });
  new LocateControl({ position: 'bottomright' }).addTo(mapInstance);

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
      html: `<div class="photo-pin-draft" style="background-image: url('${escapeHtml(selectedBase64)}')"></div>`,
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
  confirmBtn.disabled = !(selectedBase64 && selectedCoords &&
    $('pollutionCategory').value && $('pollutionSize').value);
}

// ---------- 4. Save Data & Category to Firestore Database ----------
async function confirmLocation() {
  const category = $('pollutionCategory').value;
  const size = $('pollutionSize').value;
  if (!selectedCoords || !selectedBase64 || !category || !size) return;

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
      size: size,
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
      size: size,
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
      <div class="popup-body">
        <strong class="popup-title">${escapeHtml(categoryLabel(data.category))}</strong>
        <span class="status-chip status-${statusClass}">${statusBadge(status)}${escapeHtml(STATUS_LABELS[status])}</span>
        ${sizeLabel(data.size) ? `<p class="popup-meta">${escapeHtml(TEXT.popupSize)}: ${escapeHtml(sizeLabel(data.size))}</p>` : ''}
        ${date ? `<p class="popup-meta">${escapeHtml(TEXT.popupReportedOn)} ${escapeHtml(date)}</p>` : ''}
        ${sentTo.length ? `<p class="popup-meta">${escapeHtml(TEXT.popupSentTo)}: ${escapeHtml(sentTo.join(', '))}</p>` : ''}
        <button class="primary-btn popup-action" type="button" data-action="take-action" data-id="${safeId}">${escapeHtml(TEXT.popupTakeAction)}</button>
      </div>
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
      html: `<div class="pin pin-${STATUS_CLASSES[status]}"><div class="pin-photo"${imageStyle}></div>${statusBadge(status)}</div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20]
    });

    L.marker([lat, lng], { icon: photoIcon, title: categoryLabel(data.category) })
      .addTo(pinLayer)
      .bindPopup(popupHtml(doc.id, data), { maxWidth: 240, minWidth: 200 });
  });
}

// ---------- 6. Moderator actions ----------
// Moderators sign in with Firebase Auth. The Firestore rules (firestore.rules)
// are what actually enforce this; the checks here just keep the UI honest.
async function checkModerator(user) {
  if (!user) return false;
  try {
    const doc = await db.collection('admins').doc(user.uid).get();
    return doc.exists;
  } catch (error) {
    console.error('Could not check moderator status:', error);
    return false;
  }
}

function setModerator(value) {
  isModerator = value;
  $('modBar').hidden = !value;
}

auth.onAuthStateChanged(async (user) => {
  setModerator(await checkModerator(user));
});

// Uses a pop-up window (redirect sign-in is unreliable on sites not hosted by Firebase).
// Must be called straight from a click so the browser allows the pop-up.
async function signInModerator() {
  try {
    const result = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    if (!(await checkModerator(result.user))) {
      await auth.signOut();
      return TEXT.modNotModerator;
    }
    setModerator(true);
    return null;
  } catch (error) {
    console.error('Sign-in failed:', error);
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)) {
      return TEXT.modCancelled;
    }
    if (error.code === 'auth/popup-blocked') return TEXT.modPopupBlocked;
    if (error.code === 'auth/unauthorized-domain') return TEXT.modBadDomain;
    return TEXT.modSignInFailed;
  }
}

// Signs in with Google first (if needed), then confirms the action.
async function moderatorDialog(opts) {
  if (!isModerator) {
    const signedIn = await showDialog({
      title: TEXT.modSignInTitle,
      message: TEXT.modSignInMessage,
      confirmText: TEXT.modSignInButton,
      onConfirm: signInModerator
    });
    if (!signedIn) return null;
  }

  return showDialog({
    title: opts.title,
    message: opts.message,
    confirmText: opts.confirmText,
    danger: opts.danger,
    onConfirm: async () => {
      try {
        await opts.run();
      } catch (error) {
        console.error(error);
        return error.code === 'permission-denied' ? TEXT.modNoPermission : opts.errorText;
      }
    }
  });
}

async function signOutModerator() {
  await auth.signOut();
  setModerator(false);
  showToast(TEXT.modSignedOut);
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
  $('pollutionCategory').value = '';
  $('pollutionSize').value = '';
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
  showContacts();
  reportForm.hidden = true;
  actionSection.hidden = false;
  reportBtn.hidden = true;
  sheet.hidden = false;
}

// Look up city / county / state / country for a point.
// Uses OpenStreetMap's free Nominatim service (keep it under ~1 request a second).
const placeCache = {};
let contactsRequestId = 0;

async function lookUpPlace(lat, lng) {
  const key = lat.toFixed(4) + ',' + lng.toFixed(4);
  if (placeCache[key]) return placeCache[key];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1' +
      `&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Place lookup failed: HTTP ' + response.status);
    const address = (await response.json()).address || {};
    const place = {
      country: (address.country_code || '').toLowerCase(),
      countryName: address.country || '',
      state: address.state || '',
      stateCode: (address['ISO3166-2-lvl4'] || '').split('-')[1] || '',
      county: address.county || '',
      city: address.city || address.town || address.village || address.hamlet || address.municipality || ''
    };
    placeCache[key] = place;
    return place;
  } finally {
    clearTimeout(timer);
  }
}

function placeName(place) {
  return [place.city || place.county, place.state, place.countryName].filter(Boolean).join(', ');
}

function epaRegion(stateCode) {
  return Object.keys(EPA_REGIONS).find((region) => EPA_REGIONS[region].includes(stateCode)) || '';
}

// Fill {city}, {state}... in agencies.js text. forUrl encodes the values for a web address.
function fillTemplate(text, place, forUrl) {
  const values = {
    city: place.city || place.county || (forUrl ? '' : TEXT.yourArea),
    county: place.county,
    state: place.state || place.countryName,
    country: place.countryName,
    epaRegion: epaRegion(place.stateCode)
  };
  return text.replace(/\{(city|county|state|country|epaRegion)\}/g, (match, key) => {
    const value = values[key] || '';
    return forUrl ? encodeURIComponent(value).replace(/%20/g, '+') : value;
  });
}

function placeMatches(match, place) {
  return Object.keys(match).every((key) => {
    const wanted = [].concat(match[key]).map((v) => String(v).toLowerCase());
    return wanted.includes(String(place[key] || '').toLowerCase());
  });
}

// Contacts for a place: defaults, then US contacts, then specific places on top
function contactsFor(place) {
  const contacts = Object.assign({}, DEFAULT_CONTACTS);
  if (place.country === 'us') Object.assign(contacts, US_CONTACTS);
  PLACE_CONTACTS.forEach((entry) => {
    if (placeMatches(entry.match, place)) Object.assign(contacts, entry.contacts);
  });
  if (!place.state && !place.countryName) delete contacts.state; // place unknown
  return contacts;
}

async function showContacts() {
  const requestId = ++contactsRequestId;
  const report = currentReport;
  const placeLine = $('actionPlace');
  placeLine.textContent = TEXT.findingContacts;
  placeLine.classList.add('is-loading');
  $('agencyList').textContent = '';

  let place = null;
  try {
    place = await lookUpPlace(report.lat, report.lng);
  } catch (error) {
    console.error(error);
  }
  if (requestId !== contactsRequestId || report !== currentReport) return;

  placeLine.classList.remove('is-loading');
  placeLine.textContent = (place && placeName(place)) || TEXT.placeUnknown;
  renderContacts(place || {});
}

// Recommended contacts for this category first (tagged), then the rest
function renderContacts(place) {
  const list = $('agencyList');
  const contacts = contactsFor(place);
  const category = CATEGORIES.find((c) => c.value === currentReport.category);
  const recommended = (category ? category.contacts : []).filter((role) => contacts[role]);
  const others = CONTACT_ORDER.filter((role) => contacts[role] && !recommended.includes(role));

  list.textContent = '';
  recommended.concat(others).forEach((role) => {
    list.appendChild(contactRow(contacts[role], place, recommended.includes(role)));
  });
}

function contactRow(contact, place, isRecommended) {
  const isPhone = contact.kind === 'phone';
  const row = document.createElement(isPhone ? 'a' : 'button');
  row.className = 'agency' + (contact.urgent ? ' agency-urgent' : '');
  if (isPhone) row.href = 'tel:' + contact.value;
  else row.type = 'button';

  const iconName = { email: 'mail', phone: 'phone', web: 'building' }[contact.kind];
  row.innerHTML = `
    <span class="agency-icon">${icon(iconName)}</span>
    <span class="agency-text">
      ${isRecommended ? `<span class="agency-tag">${escapeHtml(TEXT.recommended)}</span>` : ''}
      <strong>${escapeHtml(fillTemplate(contact.name, place))}</strong>
      <span>${escapeHtml(fillTemplate(contact.note, place))}</span>
    </span>
    <svg class="icon agency-chevron" aria-hidden="true"><use href="#i-chevron"/></svg>`;
  row.addEventListener('click', () => contactAgency(contact, place));
  return row;
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
    size: data.size || '',
    status: normalizeStatus(data.status),
    sentTo: Array.isArray(data.sentTo) ? data.sentTo.slice() : []
  };
  showActionPanel(false);
}

function reportText(r) {
  return TEXT.reportBody({ lat: r.lat, lng: r.lng, category: categoryLabel(r.category), size: sizeLabel(r.size) });
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

async function contactAgency(contact, place) {
  if (!currentReport) return;
  const report = currentReport;
  const text = reportText(report);

  if (contact.kind === 'email') {
    const subject = encodeURIComponent(TEXT.reportEmailSubject(categoryLabel(report.category)));
    window.location.href = `mailto:${contact.value}?subject=${subject}&body=${encodeURIComponent(text)}`;
  } else if (contact.kind === 'web') {
    const url = fillTemplate(contact.value, place, true);
    if (copyText(text)) {
      // Open in the same click so popup blockers allow it
      window.open(url, '_blank', 'noopener');
      showToast(TEXT.copiedForForm);
    } else {
      // Fallback: show the text so they can copy it manually
      const go = await showDialog({
        title: TEXT.copyManualTitle,
        message: TEXT.copyManualMessage,
        text: text,
        confirmText: TEXT.openSite
      });
      if (!go) return;
      window.open(url, '_blank', 'noopener');
    }
  }
  // Phone: the tel: link itself starts the call
  markSent(contact.id, report);
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
$('signOutBtn').addEventListener('click', signOutModerator);
$('pollutionCategory').addEventListener('change', updateConfirmState);
$('pollutionSize').addEventListener('change', updateConfirmState);
confirmBtn.addEventListener('click', confirmLocation);

initMap();

// If location is already allowed, start the map where the visitor is
if (window.isSecureContext && navigator.permissions) {
  navigator.permissions.query({ name: 'geolocation' })
    .then((status) => { if (status.state === 'granted' && !reporting) locateUser(); })
    .catch(() => {});
}
