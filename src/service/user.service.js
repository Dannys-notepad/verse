import { findUserById, upsertUser } from '../db/repos/user.repo.js';
import createUserModel from '../models/user.model.js';

export async function ensureUserExists(userPayload) {
  const existingUser = await findUserById(userPayload.id);

  if (existingUser) {
    // update activity only
    await upsertUser({ id: userPayload.id });
    return existingUser;
  }

  // create new user
  const newUser = createUserModel(userPayload);
  await upsertUser(newUser);

  return newUser;
}