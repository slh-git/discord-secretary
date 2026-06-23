// Shared v1 service-key auth for /api/* routes.
// The Discord app sends DISCORD_SERVICE_API_KEY as Authorization: Bearer <key>; routes use these helpers to reject everyone else.

// Pull the raw token out of: Authorization: Bearer <DISCORD_SERVICE_API_KEY>
// Returns null when the header is missing or not in Bearer format.
export function extractBearerToken(authorizationHeader: string | undefined) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  // Case-insensitive "Bearer" prefix, then capture everything after it.
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

// Compare the request's service key to the one configured on the API.
// v1 rule: only the Discord app should know DISCORD_SERVICE_API_KEY.
export function isValidServiceKey(providedKey: string | null) {
  const expectedKey = process.env.DISCORD_SERVICE_API_KEY?.trim();

  // Fail closed: if the server has no key configured, reject everyone.
  if (!expectedKey || !providedKey) {
    return false;
  }

  return providedKey === expectedKey;
}

// Stable 401 body when the Bearer token is missing or wrong.
export const unauthorizedServiceKeyBody = {
  error: {
    code: "UNAUTHORIZED",
    message: "Invalid or missing service API key."
  }
} as const;