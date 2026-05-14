import { PREFERENCES, ACCOUNT_STATUS, PLANS } from './enums.js';

function createUserModel({
    id,
    platform,
}) {
    return {
        id,
        platform,
        token: 20,
        lastTokenReset: new Date().toISOString(),
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        languagePreference: PREFERENCES.LANGUAGE
    };
}


export function shouldResetTokens(lastReset) {
    const now = new Date();
    const lastResetDate = new Date(lastReset);
    
    // Check if it's past 00:20
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isPast0020 = currentHour > 0 || (currentHour === 0 && currentMinute >= 20);
    
    // Check if 24 hours have passed
    const hoursSinceReset = (now - lastResetDate) / (1000 * 60 * 60);
    
    return isPast0020 && hoursSinceReset >= 24;
}

export default createUserModel;