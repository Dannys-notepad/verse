import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firestore;

if (!admin.apps.length) {
    const serviceAccountPath = path.resolve(
        __dirname,
        '../config/firebase-service-account.json'
    );

    const serviceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, 'utf8')
    );

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    firestore = admin.firestore();
}

export const db = firestore;
export { admin };