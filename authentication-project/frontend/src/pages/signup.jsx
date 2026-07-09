import { useState } from "react";
import "./authentication.css";

function SignUp() {
  const [email, setEmail] = useState();
  const [password, setPass] = useState();
  const [message, setMessage] = useState();
  const [name, setName] = useState();

  const handleSubmit = async (event) => {
    event.preventDefault();
    const res = await fetch("http://localhost:3000/api/signup", {
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
    const data = await res.json();
    setMessage(data.message);
  };
  return (
    <>
      <form className="signup-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        ></input>
        <input
          type="text"
          placeholder="Enter Email"
          onChange={(e) => setEmail(e.target.value)}
          value={email}
        ></input>
        <input
          type="text"
          placeholder="Enter Password"
          onChange={(e) => setPass(e.target.value)}
          value={password}
        ></input>
        <button type="submit" title="Submit">
          Sign In
        </button>
      </form>
      <p>Server responded : {message}</p>
    </>
  );
}

export default SignUp;
