// Authentication helpers for Community Notes API
import { getOAuth1Headers } from "./getOAuth1Token";

/**
 * Returns the Authorization header for Bearer token (OAuth 2.0, user context)
 */
export function getBearerAuthHeader(bearerToken: string) {
  return {
    Authorization: `Bearer ${bearerToken}`,
  };
}

/**
 * Returns the Authorization headers for OAuth 1.0a authentication
 */
export function getOAuth1AuthHeaders(
  url: string,
  method: string = "GET",
  body?: string
) {
  return getOAuth1Headers(url, method, body);
}
