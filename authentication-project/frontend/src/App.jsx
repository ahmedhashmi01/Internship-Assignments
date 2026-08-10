import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Routes, Route, Link, Navigate } from "react-router-dom";

import { refreshAccessToken } from "./features/auth/authSlice";
import Dashboard from "./pages/dashboard/dashboard";
import SignInPage from "./pages/signin";
import SignUp from "./pages/signup";

import "./App.css";

function App() {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(refreshAccessToken());
  }, [dispatch]);
  return (
    <div className="App">
      <nav className="navigation">
        <Link className="nav-link" to="/signup">
          Sign Up
        </Link>

        {" | "}

        <Link className="nav-link" to="/signin">
          Sign In
        </Link>
      </nav>

      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/signin" replace />
            )
          }
        />

        <Route path="/signup" element={<SignUp />} />

        <Route
          path="/signin"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <SignInPage />
            )
          }
        />

        <Route
          path="/dashboard"
          element={
            isAuthenticated ? <Dashboard /> : <Navigate to="/signin" replace />
          }
        />

        <Route
          path="*"
          element={
            <Navigate to={isAuthenticated ? "/dashboard" : "/signin"} replace />
          }
        />
      </Routes>
    </div>
  );
}

export default App;
