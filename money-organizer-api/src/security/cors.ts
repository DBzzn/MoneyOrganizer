export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export function parseCsv(value?: string): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isTailscaleIp(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);

  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    parts[0] === 100 &&
    parts[1] >= 64 &&
    parts[1] <= 127
  );
}

export function isAllowedTailscaleOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const isDevFrontendPort = url.port === '5173' || url.port === '4173';
    const isHttpProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    const hostname = url.hostname.toLowerCase();

    return (
      isHttpProtocol &&
      isDevFrontendPort &&
      (isTailscaleIp(hostname) || hostname.endsWith('.ts.net'))
    );
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  options?: {
    configuredOrigins?: string[];
    allowTailscaleOrigins?: boolean;
  },
): boolean {
  if (!origin) {
    return true;
  }

  const allowedOrigins =
    options?.configuredOrigins && options.configuredOrigins.length > 0
      ? options.configuredOrigins
      : DEFAULT_CORS_ORIGINS;
  const allowTailscaleOrigins = options?.allowTailscaleOrigins ?? true;

  return (
    allowedOrigins.includes(origin) ||
    (allowTailscaleOrigins && isAllowedTailscaleOrigin(origin))
  );
}

export function createCorsOriginValidator(options?: {
  configuredOrigins?: string[];
  allowTailscaleOrigins?: boolean;
}) {
  return (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    const isAllowed = isAllowedCorsOrigin(origin, options);

    callback(
      isAllowed ? null : new Error('Origin not allowed by CORS'),
      isAllowed,
    );
  };
}
