"use client";

import {
  ApiError,
  AuthState,
  clearStoredAuth,
  getCurrentUser,
  readStoredAuth,
  refreshAuth,
  storeAuth,
} from "./api";

export type PasswordValidation = {
  valid: boolean;
  errors: string[];
};

export function formatApiError(err: unknown, fallback = "Unexpected error.") {
  if (err instanceof ApiError) {
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

export function isTokenNearExpiry(auth: AuthState) {
  const expiresAt = new Date(auth.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt - Date.now() < 60_000;
}

export async function loadStoredSession() {
  const stored = readStoredAuth();
  if (!stored) {
    return null;
  }

  const activeAuth = isTokenNearExpiry(stored)
    ? await refreshAuth(stored.refresh_token)
    : stored;
  const user = await getCurrentUser(activeAuth.access_token);
  const nextAuth = { ...activeAuth, user };
  storeAuth(nextAuth);
  return nextAuth;
}

export async function ensureFreshAuth(auth: AuthState | null) {
  const current = auth ?? readStoredAuth();
  if (!current) {
    throw new Error("Please sign in again.");
  }

  if (!isTokenNearExpiry(current)) {
    return current;
  }

  const refreshed = await refreshAuth(current.refresh_token);
  storeAuth(refreshed);
  return refreshed;
}

export function clearSession() {
  clearStoredAuth();
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Use at least 8 characters.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Include at least one uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Include at least one lowercase letter.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Include at least one number.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Include at least one special character.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
