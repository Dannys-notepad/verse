import admin from 'firebase-admin';

let firestore;

try {
    if (!admin.apps.length) {
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

        if (!serviceAccountJson) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
        }

        const serviceAccount = JSON.parse(serviceAccountJson);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }

    firestore = admin.firestore();
} catch (error) {
    console.error('Firebase initialization error:', error.message);
    throw error;
}

if (!firestore) {
    throw new Error('Firestore instance could not be initialized');
}

export const db = firestore;
export { admin };