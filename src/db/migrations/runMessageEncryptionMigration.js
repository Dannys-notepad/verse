import { db } from '../firebase.js';
import { encrypt } from '../../utils/encrypt-decrypt.js';

let migrationPromise = null;

const ENABLE_MESSAGE_ENCRYPTION_MIGRATION = false;

function isEncryptedPayload(value) {
    return typeof value === 'string' && /^[a-fA-F0-9]{32}:[a-fA-F0-9]+$/.test(value);
}

async function migrateMessageRecord(doc, secretKey) {
    const data = doc.data() || {};
    const rawText = typeof data.text === 'string' ? data.text : '';

    if (!rawText) {
        return null;
    }

    if (data.encryptedContent && isEncryptedPayload(data.encryptedContent)) {
        return null;
    }

    const encryptedValue = isEncryptedPayload(rawText)
        ? rawText
        : encrypt(rawText, secretKey);

    await doc.ref.update({
        text: encryptedValue,
        encryptedContent: encryptedValue,
    });

    return doc.ref.id;
}

export async function backfillAllMessageEncryption() {
    if (!ENABLE_MESSAGE_ENCRYPTION_MIGRATION) {
        return 0;
    }

    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
        throw new Error('SECRET_KEY is required');
    }

    const snapshot = await db.collectionGroup('messages').get();
    const results = await Promise.all(
        snapshot.docs.map(doc => migrateMessageRecord(doc, secretKey))
    );

    return results.filter(Boolean).length;
}

export async function runMessageEncryptionMigrationOnce() {
    if (!ENABLE_MESSAGE_ENCRYPTION_MIGRATION) {
        return 0;
    }

    if (!migrationPromise) {
        migrationPromise = backfillAllMessageEncryption();
    }

    return migrationPromise;
}
