// Authentication helpers for Community Notes API

/**
 * Returns the Authorization header for Bearer token (OAuth 2.0, user context)
 */
export function getBearerAuthHeader(bearerToken: string) {
  return {
    Authorization: `Bearer ${bearerToken}`,
  };
}

// Placeholder for OAuth 1.0a if needed in the future
// export function getOAuth1aAuthHeader(...) { ... }
