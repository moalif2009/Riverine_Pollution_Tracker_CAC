# Riverine_Pollution_Tracker_CAC
Tracks riverine pollution and maps it digitally on a map. 

This is our submission for the Congressional App Challenge 2026. 

Work in Progress

## Moderator setup (Firebase)

Moderators sign in with Firebase Authentication. Only moderators can mark a
report Resolved or delete it; the rules in `firestore.rules` enforce this.

1. **Enable sign-in:** Firebase console → Authentication → Sign-in method →
   enable **Email/Password**.
2. **Create a moderator account:** Authentication → Users → **Add user**.
   Copy the new user's **User UID**.
3. **Mark them as a moderator:** Firestore Database → Start collection
   `admins` → Document ID = the UID → add any field (e.g. `role: "moderator"`).
4. **Apply the rules:** Firestore Database → Rules → paste `firestore.rules`
   → **Publish**.

To remove a moderator, delete their document in `admins`.
