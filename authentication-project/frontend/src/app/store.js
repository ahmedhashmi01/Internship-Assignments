import { configureStore } from "@reduxjs/toolkit";

import authReducer from "app/features/auth/authSlice";
import usersReducer from "app/features/users/usersSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    users: usersReducer,
  },
});
