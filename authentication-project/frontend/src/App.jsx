import { Routes, Route, Link } from "react-router-dom";
import SignInPage from "./pages/signin";
import SignUp from "./pages/signup";
import "./App.css";
function App() {
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
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signin" element={<SignInPage />} />
      </Routes>
    </div>
  );
}

export default App;
