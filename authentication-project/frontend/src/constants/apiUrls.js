const BE_URL = import.meta.env.VITE_BE_URL;

if (!BE_URL) {
  throw new Error("VITE_BE_URL is not defined");
}

export const API_URLS = {
  BASE: BE_URL,

  USERS: `${BE_URL}/api/users`,
  USER: (userId) => `${BE_URL}/api/users/${userId}`,
  DELETE_USER: (userId) => `${BE_URL}/api/delete/${userId}`,
  UPDATE_USER: `${BE_URL}/api/update`,

  AUTH: {
    SIGN_UP: `${BE_URL}/api/signup`,
    SIGN_IN: `${BE_URL}/api/signin`,
    REFRESH_TOKEN: `${BE_URL}/api/auth/refresh`,
    LOGOUT: `${BE_URL}/api/auth/logout`,
  },
};
