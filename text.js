// ==========================================
// ALL USER-FACING TEXT
// Edit wording here. index.html fills elements that have
// data-text="key" from this object, and app.js uses it for messages.
// ==========================================
const TEXT = {
  appName: 'Cleanly',
  appTagline: 'Report pollution near you',

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
  photoChecking: 'Checking photo…',
  photoRejected: 'This photo can’t be used. Please take a photo of the pollution.',
  locationLabel: 'Location',
  categoryLabel: 'Pollution type',
  categoryPlaceholder: 'Choose a type',
  sizeLabel: 'How big is it?',
  sizePlaceholder: 'Choose a size',
  sizeHint: 'Report problems too big for one person to clean up, not a single piece of litter.',
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
  recommended: 'Recommended',
  // (Agency buttons are in agencies.js)
  findingContacts: 'Finding who to contact here…',
  placeUnknown: 'Could not look up this location. Showing general contacts.',
  yourArea: 'your area',

  // Pin popups
  popupDefaultCategory: 'Pollution report',
  popupStatus: 'Status',
  popupReportedOn: 'Reported',
  popupSentTo: 'Sent to',
  popupSize: 'Size',
  popupTakeAction: 'Take action',
  popupResolve: 'Mark resolved',
  popupDelete: 'Remove',
  popupNoPhoto: 'No photo',

  // Moderator dialogs
  modSignInTitle: 'Moderator sign in',
  modSignInMessage: 'Only moderators can do this. Sign in with your Google account.',
  modSignInButton: 'Sign in with Google',
  modCancelled: 'Sign-in was cancelled.',
  modPopupBlocked: 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  modBadDomain: 'This website is not allowed to sign in yet. Add it in Firebase under Authentication > Settings > Authorized domains.',
  modNotModerator: 'This Google account is not a moderator.',
  modSignInFailed: 'Could not sign in. Check your connection.',
  modNoPermission: 'You do not have permission to do this.',
  modSignedIn: 'Moderator',
  modSignOut: 'Sign out',
  modSignedOut: 'Signed out.',
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
  copiedForForm: 'Report copied. Paste it into their form.',
  searchHintTitle: 'Your report is copied',
  searchHint: (words) => `On the site, search for “${words}”, choose that request, and paste your report into the form.`,
  copyManualTitle: 'Copy this report',
  copyManualMessage: 'Copy the text below, then paste it into their form.',
  openSite: 'Open site',

  // Text sent to agencies
  // r.category and r.size are the display labels
  reportEmailSubject: (category) => `Pollution report: ${category}`,
  reportBody: (r) =>
    `Pollution report: ${r.category}\n` +
    (r.size ? `Size: ${r.size}\n` : '') +
    `Location: ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}\n` +
    `Map: https://www.google.com/maps?q=${r.lat},${r.lng}\n\n` +
    `Submitted through Cleanly.`
};

// Status labels. The keys are the values stored in Firestore; don't change them.
const STATUS_LABELS = {
  'Reported': 'Reported',
  'Sent to agency': 'Sent to agency',
  'Resolved': 'Resolved'
};

// Pollution categories. "value" is stored in Firestore; "label" is what people see.
// Keep the first four values as they are: existing reports use them.
// "contacts" are the roles recommended in the Take action panel, in order
// (see agencies.js: local, state, waterkeeper, epa, spill).
const CATEGORIES = [
  // Water
  { group: 'Water', value: 'Sewage / Runoff', label: 'Sewage overflow or leak', contacts: ['local', 'waterkeeper', 'state'] },
  { group: 'Water', value: 'Chemical / Discoloration', label: 'Oil, chemical, or discolored water', contacts: ['state', 'spill', 'waterkeeper'] },
  { group: 'Water', value: 'Trash in Waterway', label: 'Trash in a river, creek, or storm drain', contacts: ['waterkeeper', 'local'] },
  { group: 'Water', value: 'Construction Runoff', label: 'Muddy runoff from a construction site', contacts: ['local', 'state', 'waterkeeper'] },
  { group: 'Water', value: 'Fish Kill', label: 'Dead fish or wildlife', contacts: ['state', 'waterkeeper'] },
  // Land
  { group: 'Land', value: 'Illegal Dumping', label: 'Illegal dumping (tires, furniture, debris)', contacts: ['local', 'state'] },
  { group: 'Land', value: 'Plastic Waste', label: 'Large buildup of trash or plastic', contacts: ['local'] },
  { group: 'Land', value: 'Hazardous Waste', label: 'Hazardous waste (drums, batteries, paint)', contacts: ['state', 'spill', 'local'] },
  // Air
  { group: 'Air', value: 'Open Burning', label: 'Open burning or heavy smoke', contacts: ['state', 'local'] }
];

// Size choices. There is deliberately no option for a single item.
const SIZES = [
  { value: 'bags', label: "A few bags' worth" },
  { value: 'truckload', label: 'A truckload or more' },
  { value: 'large-area', label: 'Covers a large area' },
  { value: 'ongoing', label: 'Ongoing leak, flow, or smoke' }
];
