const FIVE_DAYS_IN_MS = 5 * 24 * 60 * 60 * 1000;
const isProd = process.env.NODE_ENV === "production";

export const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd, // true only behind HTTPS in prod
  sameSite: isProd ? "none" : "lax", // "lax" works fine for localhost:port cross-port calls
  maxAge: FIVE_DAYS_IN_MS,
  path: "/",
};
