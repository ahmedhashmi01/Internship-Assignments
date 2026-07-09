import { useState } from "react";

function SignInPage() {
  const [email, setEmail] = useState();
  const [password, setPass] = useState();
  const [message, setMessage] = useState();

  const handleSubmit = async (event) => {
    event.preventDefault();
    const res = await fetch("http://localhost:3000/api/signin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });
    const data = await res.json();
    setMessage(data.message);
  };
  return (
    <>
      <form className="signin-form" onSubmit={handleSubmit}>
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

export default SignInPage;
