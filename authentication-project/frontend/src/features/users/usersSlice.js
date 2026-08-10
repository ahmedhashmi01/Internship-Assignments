import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { authenticatedFetch } from "../../services/apiClient";

const initialState = {
  users: [],
  loading: false,
  deletingId: null,
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
      const accessToken = thunkAPI.getState().auth.accessToken;

      const response = await authenticatedFetch(
        `/api/delete/${userId}`,
        accessToken,
        {
          method: "DELETE",
        }
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
      });
  },
});

export const { clearUsers } = usersSlice.actions;

export default usersSlice.reducer;
