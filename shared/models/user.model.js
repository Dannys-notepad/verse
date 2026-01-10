import { PREFERENCES, PLATFORMS, PLANS } from './enums.js';

function createUserModel({
  id,
  platform,
  username,
  displayName,
}) {
  return {
    /* -------------------- Identity -------------------- */
    id,                     // platform-specific user ID
    platform,               // whatsapp | telegram | facebook

    /* -------------------- Profile -------------------- */
    username: username || null,
    displayName: displayName || null,

    /* -------------------- Account -------------------- */
    plan: PLANS.FREE,       // free | pro (default free)
    isActive: true,
    languagePreference: PREFERENCES.LANGUAGE,

    /* -------------------- Usage State -------------------- */
    //totalDownloads: 0,      // lifetime metric (optional)
    //totalAiCalls: 0,        // lifetime metric (optional)

    /* -------------------- Metadata -------------------- */
    createdAt: null,        // Firestore serverTimestamp
    lastActiveAt: null,     // Firestore serverTimestamp
  };
}


export default createUserModel;