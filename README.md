# Riverine_Pollution_Tracker_CAC
Tracks riverine pollution and maps it digitally on a map. 

This is our submission for the Congressional App Challenge 2026. 

Work in Progress



Old website:

https://riverine-pollution-tracker-cac.vercel.app

## Moderator setup (Firebase)

Moderators sign in with Google. Only moderators can mark a report Resolved
or delete it; the rules in `firestore.rules` enforce this.

1. **Turn on Google sign-in:** Firebase console → Authentication →
   Sign-in method → Google → Enable → pick a support email → Save.
2. **Allow your website:** Authentication → Settings → Authorized domains →
   add `riverine-pollution-tracker-cac.vercel.app`.
3. **Sign in once on the website:** tap a pin → Remove → Sign in with Google.
   It will say "not a moderator". That's expected.
4. **Copy your User UID:** Authentication → Users → copy the User UID next to
   your Google email.
5. **Mark yourself as a moderator:** Firestore Database → Data →
   Start collection `admins` → Document ID = the UID → field `role` (string)
   = `moderator` → Save.
6. **Apply the rules:** Firestore Database → Rules → paste `firestore.rules`
   → Publish.

To add another moderator, they do step 3, then you repeat steps 4–5 with
their UID. To remove one, delete their document in `admins`.
