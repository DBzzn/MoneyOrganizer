export const RATE_LIMIT_WINDOW_MS = 60_000;

export const RATE_LIMITS = {
  default: {
    limit: 120,
    ttl: RATE_LIMIT_WINDOW_MS,
  },
  login: {
    limit: 5,
    ttl: RATE_LIMIT_WINDOW_MS,
  },
  upload: {
    limit: 20,
    ttl: RATE_LIMIT_WINDOW_MS,
  },
  destructive: {
    limit: 30,
    ttl: RATE_LIMIT_WINDOW_MS,
  },
} as const;
