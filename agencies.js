// ==========================================
// WHO TO CONTACT
// The app looks up where a report is (city, county, state, country) and
// shows the contacts below for that place.
//
// Each contact has a "role". Categories in text.js recommend roles:
//   local       = city / county services (like 311)
//   state       = state (or national) environmental agency
//   waterkeeper = local river / water protection group
//   epa         = US EPA (US only)
//   spill       = 24/7 spill hotline (US only)
//
// Contact fields:
//   id    - saved in the report's sentTo list. If you add a NEW id,
//           also add it to the sentTo list in firestore.rules.
//   name  - button title          note - smaller text under it
//   kind  - 'email' (opens email app), 'web' (copies the report, opens
//           the site), or 'phone' (calls the number)
//   value - email address, web address, or phone number (digits only)
//   urgent - true shows the button in red
// In name, note and value you can use {city}, {county}, {state},
// {country} and {epaRegion}; they're filled in for each report.
// ==========================================

// Used anywhere in the world (unless a place below replaces them)
const DEFAULT_CONTACTS = {
  local: {
    id: 'Local government',
    name: 'Report to {city}',
    note: 'Copies the report, then searches for where to report it locally.',
    kind: 'web',
    value: 'https://www.google.com/search?q={city}+{state}+report+pollution+illegal+dumping'
  },
  state: {
    id: 'State environmental agency',
    name: '{state} environmental agency',
    note: 'Copies the report, then searches for the agency’s complaint page.',
    kind: 'web',
    value: 'https://www.google.com/search?q={state}+{country}+environmental+agency+report+pollution'
  },
  waterkeeper: {
    id: 'Waterkeeper',
    name: 'Find your local Waterkeeper',
    note: 'River and water protection groups around the world.',
    kind: 'web',
    value: 'https://waterkeeper.org/findyourwaterkeeper/'
  }
};

// Used in the United States
const US_CONTACTS = {
  epa: {
    id: 'EPA',
    name: 'Report to EPA (Region {epaRegion})',
    note: 'Copies the report, then opens the EPA violation form.',
    kind: 'web',
    value: 'https://www.epa.gov/tips'
  },
  spill: {
    id: 'National Response Center',
    name: 'Call National Response Center (24/7)',
    note: '(800) 424-8802 · Oil or chemical spills anywhere in the US.',
    kind: 'phone',
    value: '18004248802',
    urgent: true
  }
};

// EPA regions by state code
const EPA_REGIONS = {
  1: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'],
  2: ['NJ', 'NY', 'PR', 'VI'],
  3: ['DE', 'DC', 'MD', 'PA', 'VA', 'WV'],
  4: ['AL', 'FL', 'GA', 'KY', 'MS', 'NC', 'SC', 'TN'],
  5: ['IL', 'IN', 'MI', 'MN', 'OH', 'WI'],
  6: ['AR', 'LA', 'NM', 'OK', 'TX'],
  7: ['IA', 'KS', 'MO', 'NE'],
  8: ['CO', 'MT', 'ND', 'SD', 'UT', 'WY'],
  9: ['AZ', 'CA', 'HI', 'NV', 'GU', 'AS', 'MP'],
  10: ['AK', 'ID', 'OR', 'WA']
};

// Specific places. These replace the matching default role.
// "match" can use country (2-letter code), state, county and city.
// Add your own region by copying one of these blocks.
const PLACE_CONTACTS = [
  {
    match: { country: 'us', state: 'Georgia' },
    contacts: {
      state: {
        id: 'Georgia EPD',
        name: 'Call GA EPD (24/7)',
        note: '(800) 241-4113 · Spills, fish kills, or other emergencies.',
        kind: 'phone',
        value: '18002414113',
        urgent: true
      }
    }
  },
  {
    // Chattahoochee River basin around metro Atlanta
    match: {
      country: 'us',
      state: 'Georgia',
      county: ['Fulton County', 'DeKalb County', 'Cobb County', 'Gwinnett County', 'Forsyth County',
               'Hall County', 'Douglas County', 'Clayton County', 'Carroll County', 'Coweta County']
    },
    contacts: {
      waterkeeper: {
        id: 'Chattahoochee Riverkeeper',
        name: 'Email Chattahoochee Riverkeeper',
        note: 'Opens your email app with the report filled in.',
        kind: 'email',
        value: 'info@chattahoochee.org'
      }
    }
  },
  {
    match: { country: 'us', state: 'Georgia', city: 'Atlanta' },
    contacts: {
      local: {
        id: 'ATL311',
        name: 'Report to ATL311',
        note: 'Copies the report, then opens the ATL311 site.',
        kind: 'web',
        value: 'https://www.atl311.com'
      }
    }
  }
];

// Order for contacts that aren't recommended for a category
const CONTACT_ORDER = ['local', 'state', 'waterkeeper', 'epa', 'spill'];
