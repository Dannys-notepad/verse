import { PREFERENCES, ACCOUNT_STATUS, PLANS } from './enums.js';

function createUserModel({
    id,
    platform,
    username,
    displayName
}) {
    return {
        id,
        platform,
        username: username || null,
        displayName: displayName || null,
        plan: PLANS.FREE,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        languagePreference: PREFERENCES.LANGUAGE
    };
}


export default createUserModel;