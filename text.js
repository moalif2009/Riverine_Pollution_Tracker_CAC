// ==========================================
// ALL USER-FACING TEXT
// Edit wording here. index.html fills elements that have
// data-text="key" from this object, and app.js uses it for messages.
// ==========================================
const TEXT = {
  appName: 'Riverine Pollution Tracker',
  appTagline: 'Chattahoochee River · Atlanta',

  legendReported: 'Reported',
  legendSent: 'Sent to agency',
  legendResolved: 'Resolved',

  reportBtn: 'Report pollution',
  locateBtn: 'Use my location',
  close: 'Close',
  cancel: 'Cancel',
  done: 'Done',

  // New report form
  newReportTitle: 'New report',
  photoLabel: 'Photo',
  photoPick: 'Take or choose a photo',
  photoChange: 'Change photo',
  locationLabel: 'Location',
  categoryLabel: 'Pollution type',
  submit: 'Submit report',
  saving: 'Saving…',

  // Location messages
  locIdle: 'Tap the map to place the pin.',
  locFinding: 'Finding your location…',
  locFound: (meters) => `Using your location (±${meters} m). Drag the pin or tap the map to adjust.`,
  locCustom: 'Custom spot selected. Drag the pin to adjust.',
  locInsecure: 'Location only works on a secure (https) page.',
  locUnsupported: 'Location is not supported by this browser.',
  locDenied: 'Location permission denied.',
  locUnavailable: 'Location could not be determined.',
  locTimeout: 'Location request timed out.',
  locFailed: 'Something went wrong getting your location.',
  locFallback: 'Tap the map to place the pin.',

  // Take action panel
  actionTitle: 'Take action',
  actionIntroNew: 'Report saved. Send it to someone who can act on it.',
  actionIntroExisting: 'Send this report to someone who can act on it.',
  alreadySentTo: 'Already sent to:',
  riverkeeperBtn: 'Email Chattahoochee Riverkeeper',
  riverkeeperNote: 'Opens your email app with the report filled in.',
  atl311Btn: 'Report to ATL311',
  atl311Note: 'Copies the report, then opens the ATL311 site.',
  epdBtn: 'Call GA EPD (24/7)',
  epdNote: '(800) 241-4113 · For spills, fish kills, or other emergencies.',

  // Pin popups
  popupDefaultCategory: 'Pollution report',
  popupStatus: 'Status',
  popupReportedOn: 'Reported',
  popupSentTo: 'Sent to',
  popupTakeAction: 'Take action',
  popupResolve: 'Mark resolved',
  popupDelete: 'Remove',
  popupNoPhoto: 'No photo',

  // Moderator dialogs
  modPasscodeTitle: 'Moderator access',
  modPasscodePrompt: 'Enter the moderator passcode.',
  modPasscodeWrong: 'Incorrect passcode.',
  continue: 'Continue',
  deleteTitle: 'Remove this report?',
  deleteMessage: 'This permanently deletes the report and its photo.',
  deleteConfirm: 'Remove',
  resolveTitle: 'Mark as resolved?',
  resolveMessage: 'Use this once the pollution has been cleaned up.',
  resolveConfirm: 'Mark resolved',
  discardTitle: 'Discard your report?',
  discardMessage: 'Your unfinished report will be lost.',
  discardConfirm: 'Discard',

  // Toasts
  saveFailed: 'Could not save the report. Please try again.',
  loadFailed: 'Could not load reports. Check your connection.',
  deleted: 'Report removed.',
  deleteFailed: 'Could not remove the report.',
  resolved: 'Report marked resolved.',
  resolveFailed: 'Could not update the report.',
  markedSent: (agency) => `Marked as sent to ${agency}.`,
  statusFailed: 'Could not update the report status.',
  copied311: 'Report copied. Paste it into the ATL311 form.',
  copyManualTitle: 'Copy this report',
  copyManualMessage: 'Copy the text below, then paste it into the ATL311 form.',
  open311: 'Open ATL311',

  // Text sent to agencies
  reportEmailSubject: (category) => `Pollution report: ${category}`,
  reportBody: (r) =>
    `Pollution report: ${r.category}\n` +
    `Location: ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}\n` +
    `Map: https://www.google.com/maps?q=${r.lat},${r.lng}\n\n` +
    `Submitted through the Riverine Pollution Tracker.`
};

// Status labels. The keys are the values stored in Firestore; don't change them.
const STATUS_LABELS = {
  'Reported': 'Reported',
  'Sent to agency': 'Sent to agency',
  'Resolved': 'Resolved'
};

// Pollution categories. "value" is stored in Firestore; "label" is what people see.
const CATEGORIES = [
  { value: 'Plastic Waste', label: 'Plastic / Solid Waste' },
  { value: 'Chemical / Discoloration', label: 'Chemical Spill / Discoloration' },
  { value: 'Illegal Dumping', label: 'Illegal Dumping / Debris' },
  { value: 'Sewage / Runoff', label: 'Sewage / Urban Runoff' }
];
