import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import { signIn } from "app/features/auth/authSlice";
import "./authentication.css";

function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { loading, error } = useSelector((state) => state.auth);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const response = await dispatch(
        signIn({
          email,
          password,
        })
      ).unwrap(); //only payload

      console.log("Sign in successful:", response);
      navigate(`/dashboard/${response.data.user.name}`, {
        replace: true,
        state: {
          message: response.message,
          name: response.data.user.name,
        },
      });
    } catch (requestError) {
      console.error("Sign in failed:", requestError);
    }
  };

  return (
    <>
      <form className="signin-form" onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Enter Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Enter Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {error && <p>Server responded: {error}</p>}
    </>
  );
}

export default SignInPage;
