import { findUserById, createUser, deductToken, resetToken, updateUserActivity } from '../db/repos/user.repo.js';
import createUserModel from '../models/user.model.js';

function getUserId(userPayload) {
  return String(userPayload?.id || '').trim();
}

function isUserBlocked(user) {
  return user?.accountStatus === 'banned';
}

function hasAvailableTokens(user) {
  return Number(user?.token || 0) > 0;
}

export async function checkUser(userPayload) {
  const userId = getUserId(userPayload);

  if (!userId) {
    throw new Error('userPayload with id is required');
  }

  try {
    // If the user already exists, just validate their account status and token balance.
    const existingUser = await findUserById(userId);

    if (existingUser) {
      if (isUserBlocked(existingUser)) {
        return 'user was temporarily banned';
      }

      if (!hasAvailableTokens(existingUser)) {
        return 'quota exhuated';
      }

      // Record activity so the dashboard and token logic can follow recent usage.
      await updateUserActivity(userId);
      return existingUser;
    }

    // New users get a default profile and token balance when they first interact.
    const newUser = createUserModel(userPayload);
    await createUser(newUser);

    return 'new user';
  } catch (error) {
    console.error(`Error ensuring user exists for ${userId}:`, error.message);
    throw error;
  }
}

export async function deductUserToken(userId) {
  if (!userId) {
    throw new Error('user id is required');
  }

  try {
    const existingUser = await findUserById(userId);

    if (existingUser) {
      // Each successful AI reply consumes one token from the user's quota.
      await deductToken(userId);
      return existingUser;
    }

    return null;
  } catch (error) {
    console.error(`Error ensuring user exists for ${userId}, deducting token failed:`, error.message);
    throw error;
  }
}

export async function resetUserToken(userId) {
  if (!userId) {
    throw new Error('user id is required');
  }

  try {
    const existingUser = await findUserById(userId);

    if (existingUser) {
      // Reset the daily quota back to the default value when the reset rule matches.
      await resetToken(userId);
      return existingUser;
    }

    return null;
  } catch (error) {
    console.error(`Error ensuring user exists for ${userId}, resetting token failed:`, error.message);
    throw error;
  }
}