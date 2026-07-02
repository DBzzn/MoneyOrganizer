export type JwtAuthPayload = {
  sub: string;
  email: string;
  jti: string;
  exp?: number;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  tokenId: string;
  tokenExpiresAt?: number;
};
