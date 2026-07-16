import { refreshAccessToken } from "../features/auth/authSlice";

const API_URL = "http://localhost:3000";

export const authenticatedFetch = async (endpoint, options = {}, thunkAPI) => {
  if (!thunkAPI) {
    throw new Error("thunkAPI was not provided to authenticatedFetch");
  }

  let accessToken = thunkAPI.getState().auth.accessToken;

  const buildRequestOptions = (token) => ({
    ...options,

    credentials: "include",

    headers: {
      ...options.headers,

      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
  });

  let response = await fetch(
    `${API_URL}${endpoint}`,
    buildRequestOptions(accessToken)
  );

  if (response.status === 401) {
    let errorData = {};

    try {
      errorData = await response.clone().json();
    } catch {
      // Ignore invalid JSON here.
    }

    if (errorData.code === "ACCESS_TOKEN_EXPIRED") {
      const refreshedData = await thunkAPI
        .dispatch(refreshAccessToken())
        .unwrap();

      accessToken = refreshedData.accessToken;

      response = await fetch(
        `${API_URL}${endpoint}`,
        buildRequestOptions(accessToken)
      );
    }
  }

  return response;
};
