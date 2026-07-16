import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { signUp } from "../features/auth/authSlice";
import "./authentication.css";

function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const dispatch = useDispatch();

  const { data, error, loading } = useSelector((state) => state.auth);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      await dispatch(
        signUp({
          name,
          email,
          password,
        })
      ).unwrap();

      setName("");
      setEmail("");
      setPassword("");
    } catch (requestError) {
      console.error("Sign up failed:", requestError);
    }
  };

  return (
    <>
      <form className="signup-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter Your Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

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
          {loading ? "Signing up..." : "Sign Up"}
        </button>
      </form>

      {error && <p>Server responded: {error}</p>}

      {data?.message && <p>Server responded: {data.message}</p>}
    </>
  );
}

export default SignUp;
