import { db, admin } from '../firebase.js';

export async function findUserById(userId) {
  const doc = await db.collection('users').doc(userId).get();
  return doc.exists ? doc.data() : null;
}

export async function upsertUser(user) {
  const ref = db.collection('users').doc(user.id);

  await ref.set(
    {
      ...user,
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return ref.id;
}