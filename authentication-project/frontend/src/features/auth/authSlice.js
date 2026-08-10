import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

const initialState = {
  user: null,
  accessToken: null,
  data: null,
  isAuthenticated: false,
  loading: false,
  error: "",
};

export const signIn = createAsyncThunk(
  "auth/signIn",

  async (credentials, thunkAPI) => {
    try {
      const response = await fetch("http://localhost:3000/api/signin", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        // Required to accept the refresh-token cookie.
        credentials: "include",

        body: JSON.stringify(credentials),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return thunkAPI.rejectWithValue(
          responseData.message || "Sign in failed"
        );
      }

      return responseData.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.message || "Unable to connect to the server"
      );
    }
  }
);
export const signUp = createAsyncThunk(
  "auth/signUp",
  async ({ name, email, password }, thunkAPI) => {
    try {
      const response = await fetch("http://localhost:3000/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return thunkAPI.rejectWithValue(
          responseData.message || "Sign up failed"
        );
      }

      return responseData;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.message || "Unable to connect to server"
      );
    }
  }
);

export const refreshAccessToken = createAsyncThunk(
  "auth/refreshAccessToken",

  async (_, thunkAPI) => {
    try {
      const response = await fetch("http://localhost:3000/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      const responseData = await response.json();

      if (!response.ok) {
        return thunkAPI.rejectWithValue(
          responseData.message || "Session has expired"
        );
      }

      return responseData.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.message || "Unable to restore the session"
      );
    }
  }
);

export const logoutUser = createAsyncThunk(
  "auth/logout",

  async (_, thunkAPI) => {
    try {
      const response = await fetch("http://localhost:3000/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      const responseData = await response.json();

      if (!response.ok) {
        return thunkAPI.rejectWithValue(
          responseData.message || "Logout failed"
        );
      }

      return responseData;
    } catch (error) {
      return thunkAPI.rejectWithValue(error.message || "Logout failed");
    }
  }
);

const authSlice = createSlice({
  name: "auth",

  initialState,

  reducers: {
    clearAuthentication: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.loading = true;
        state.error = "";
      })

      .addCase(signIn.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.isAuthenticated = true;
        state.initialized = true;
      })

      .addCase(signIn.rejected, (state, action) => {
        state.loading = false;
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.initialized = true;
        state.error = action.payload || "Sign in failed";
      })

      .addCase(signUp.pending, (state) => {
        state.loading = true;
        state.error = "";
      })

      .addCase(signUp.fulfilled, (state) => {
        state.loading = false;
        state.error = "";
      })

      .addCase(signUp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Sign up failed";
      })

      .addCase(refreshAccessToken.pending, (state) => {
        state.loading = true;
      })

      .addCase(refreshAccessToken.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.isAuthenticated = true;
        state.initialized = true;
      })

      .addCase(refreshAccessToken.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.initialized = true;
      })

      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
      });
  },
});

export const { clearAuthentication } = authSlice.actions;

export default authSlice.reducer;
