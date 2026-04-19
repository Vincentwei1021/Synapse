// src/lib/auth-client.ts
// Client-side auth utilities for OIDC token management
// Uses oidc-client-ts UserManager for token storage and refresh

import { UserManager, User } from "oidc-client-ts";
import { createUserManager, getStoredOidcConfig, storeOidcConfig, clearOidcConfig, type OidcConfig } from "./oidc";

// Singleton UserManager instance
let userManager: UserManager | null = null;
let boundManager: UserManager | null = null;
let removeUserLoadedListener: (() => void) | null = null;

function bindUserManagerEvents(manager: UserManager): void {
  if (boundManager === manager) {
    return;
  }

  removeUserLoadedListener?.();

  const handleUserLoaded = (user: User) => {
    void syncTokenToCookie(user.access_token, user.refresh_token);
  };

  manager.events.addUserLoaded(handleUserLoaded);

  boundManager = manager;
  removeUserLoadedListener = () => {
    manager.events.removeUserLoaded(handleUserLoaded);
  };
}

// Get or create UserManager
export function getUserManager(): UserManager | null {
  if (typeof window === "undefined") return null;

  if (!userManager) {
    const config = getStoredOidcConfig();
    if (config) {
      userManager = createUserManager(config);
      bindUserManagerEvents(userManager);
    }
  }
  return userManager;
}

// Initialize UserManager with config
export function initUserManager(config: OidcConfig): UserManager {
  storeOidcConfig(config);
  userManager = createUserManager(config);
  bindUserManagerEvents(userManager);
  return userManager;
}

// Clear UserManager (on logout)
export function clearUserManager(): void {
  removeUserLoadedListener?.();
  removeUserLoadedListener = null;
  boundManager = null;
  userManager = null;
}

// Get current user from UserManager
export async function getOidcUser(): Promise<User | null> {
  const manager = getUserManager();
  if (!manager) return null;

  try {
    return await manager.getUser();
  } catch {
    return null;
  }
}

// Get valid access token (will trigger silent renew if needed)
export async function getAccessToken(): Promise<string | null> {
  const user = await getOidcUser();

  if (!user) return null;

  // Check if token is expired
  if (user.expired) {
    // Try silent renew
    const manager = getUserManager();
    if (manager) {
      try {
        const renewedUser = await manager.signinSilent();
        if (renewedUser?.access_token) {
          await syncTokenToCookie(renewedUser.access_token, renewedUser.refresh_token);
        }
        return renewedUser?.access_token || null;
      } catch {
        // Silent renew failed, user needs to re-login
        return null;
      }
    }
    return null;
  }

  return user.access_token;
}

// Check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const user = await getOidcUser();
  return user !== null && !user.expired;
}

// Sync a new access token (and optionally refresh token) to HTTP-only cookies via the server endpoint
export async function syncTokenToCookie(accessToken: string, refreshToken?: string): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/sync-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, refreshToken }),
    });
    return response.ok;
  } catch {
    console.error("Failed to sync token to cookie");
    return false;
  }
}

export async function refreshAuthCookies(): Promise<boolean> {
  const oidcUser = await getOidcUser();
  if (oidcUser) {
    if (oidcUser.expired) {
      const manager = getUserManager();
      if (!manager) {
        return false;
      }

      try {
        const renewedUser = await manager.signinSilent();
        if (!renewedUser?.access_token) {
          return false;
        }
        return syncTokenToCookie(renewedUser.access_token, renewedUser.refresh_token);
      } catch {
        return false;
      }
    }

    return syncTokenToCookie(oidcUser.access_token, oidcUser.refresh_token);
  }

  try {
    const response = await fetch("/api/auth/refresh", { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

// Create authenticated fetch wrapper
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();

  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // On 401, attempt silent renew + cookie sync, then retry once
  if (response.status === 401) {
    const manager = getUserManager();
    if (manager) {
      try {
        const renewed = await manager.signinSilent();
        if (renewed?.access_token) {
          await syncTokenToCookie(renewed.access_token, renewed.refresh_token);
          headers.set("Authorization", `Bearer ${renewed.access_token}`);
          return fetch(url, { ...options, headers });
        }
      } catch {
        // Silent renew failed, return original 401
      }
    }
  }

  return response;
}

// Create fetch hook for SWR or React Query
export function createAuthFetcher() {
  return async (url: string) => {
    const response = await authFetch(url);
    if (!response.ok) {
      const error = new Error("Fetch failed");
      throw error;
    }
    return response.json();
  };
}

// Login redirect
export async function login(): Promise<void> {
  const manager = getUserManager();
  if (manager) {
    await manager.signinRedirect();
  }
}

// Logout
export async function logout(): Promise<void> {
  // Clear HTTP-only cookies (both OIDC and default auth)
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Ignore errors, continue with logout
  }

  const manager = getUserManager();
  if (manager) {
    // Only attempt OIDC signout redirect if there's an active OIDC user session.
    // Without this check, stale OIDC config in localStorage would cause default
    // auth users to be redirected to the OIDC provider on logout.
    try {
      const user = await manager.getUser();
      if (user) {
        await manager.signoutRedirect();
        return; // signoutRedirect navigates away from the page
      }
    } catch {
      // Signout redirect may fail, clean up locally
    }
    try {
      await manager.removeUser();
    } catch {
      // Ignore
    }
  }
  clearUserManager();
  clearOidcConfig();
}
