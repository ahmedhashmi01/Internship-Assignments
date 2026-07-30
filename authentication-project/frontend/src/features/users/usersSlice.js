import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { authenticatedFetch } from "app/services/apiClient";

const initialState = {
  users: [],
  loading: false,
  deletingId: null,
  updatingId: null,
  error: "",
};

export const fetchUsers = createAsyncThunk(
  "users/fetchUsers",
  async (_, thunkAPI) => {
    try {
      const response = await authenticatedFetch("/api/users", {}, thunkAPI);

      const responseData = await response.json();

      if (!response.ok) {
        return thunkAPI.rejectWithValue(
          responseData.message || "Unable to fetch users"
        );
      }

      return responseData.users;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.message || "Unable to connect to the server"
      );
    }
  }
);

export const deleteUser = createAsyncThunk(
  "users/deleteUser",

  async (userId, thunkAPI) => {
    try {
      const response = await authenticatedFetch(
        `/api/delete/${userId}`,
        {
          method: "DELETE",
        },
        thunkAPI
      );

      const responseData = await response.json();

      if (!response.ok) {
        return thunkAPI.rejectWithValue(
          responseData.message || "Unable to delete user"
        );
      }

      return {
        userId,
        message: responseData.message || "User deleted successfully",
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.message || "Unable to connect to the server"
      );
    }
  }
);

export const updateUser = createAsyncThunk(
  "users/updateUser",
  async ({ id, name, email, password }, thunkAPI) => {
    try {
      const response = await authenticatedFetch(
        "/api/update",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id, name, email, password }),
        },
        thunkAPI
      );

      const responseData = await response.json();

      if (!response.ok) {
        return thunkAPI.rejectWithValue(
          responseData.message || "Unable to update user"
        );
      }

      return responseData.user;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.message || "Unable to connect to the server"
      );
    }
  }
);

const usersSlice = createSlice({
  name: "users",

  initialState,

  reducers: {
    clearUsers: (state) => {
      state.users = [];
      state.error = "";
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = "";
      })

      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload;
        state.error = "";
      })

      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.users = [];
        state.error = action.payload || "Unable to fetch users";
      })

      .addCase(deleteUser.pending, (state, action) => {
        state.deletingId = action.meta.arg;
        state.error = "";
      })

      .addCase(deleteUser.fulfilled, (state, action) => {
        state.deletingId = null;

        state.users = state.users.filter(
          (user) => (user.id || user._id) !== action.payload.userId
        );

        state.error = "";
      })

      .addCase(deleteUser.rejected, (state, action) => {
        state.deletingId = null;
        state.error = action.payload || "Unable to delete user";
      })

      .addCase(updateUser.pending, (state, action) => {
        state.updatingId = action.meta.arg.id;
        state.error = "";
      })

      .addCase(updateUser.fulfilled, (state, action) => {
        state.updatingId = null;
        state.users = state.users.map((user) =>
          (user.id || user._id) === action.payload.id ? action.payload : user
        );
        state.error = "";
      })

      .addCase(updateUser.rejected, (state, action) => {
        state.updatingId = null;
        state.error = action.payload || "Unable to update user";
      });
  },
});

export const { clearUsers } = usersSlice.actions;

export default usersSlice.reducer;
