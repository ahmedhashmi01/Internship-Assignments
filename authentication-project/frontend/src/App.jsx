import { Routes, Route, Link, Navigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import SignInPage from "./pages/signin";
import SignUp from "./pages/signup";
import Dashboard from "./pages/dashboard/dashboard";
import { refreshAccessToken } from "./features/auth/authSlice";
import { useEffect } from "react";
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
              <Navigate to="/dashboard/:name" replace />
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
              <Navigate to="/dashboard/:name" replace />
            ) : (
              <SignInPage />
            )
          }
        />

        <Route
          path="/dashboard/:name"
          element={
            isAuthenticated ? <Dashboard /> : <Navigate to="/signin" replace />
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to={isAuthenticated ? "/dashboard/:name" : "/signin"}
              replace
            />
          }
        />
      </Routes>
    </div>
  );
}

export default App;
