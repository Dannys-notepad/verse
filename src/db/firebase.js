import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firestore;

try {
    if (!admin.apps.length) {
        const serviceAccountPath = path.resolve(
            __dirname,
            '../config/firebase-service-account.json'
        );

        // Validate service account file exists
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Service account file not found at ${serviceAccountPath}`);
        }

        const serviceAccount = JSON.parse(
            fs.readFileSync(serviceAccountPath, 'utf8')
        );

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