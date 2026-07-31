import mongoose from "mongoose";
import User from "./src/models/User.js";

const base = "http://127.0.0.1:3000";
const email = `prtest${Date.now()}@example.com`;
const password = "secret123";

const signupRes = await fetch(`${base}/api/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test User", email, password }),
});
const signupJson = await signupRes.json();

const dbUser = await User.findOne({ email }).lean();
const badSigninRes = await fetch(`${base}/api/signin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "wrongpass" }),
});
const goodSigninRes = await fetch(`${base}/api/signin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const goodSigninJson = await goodSigninRes.json();
const token = goodSigninJson.data.accessToken;

const unauthUpdateRes = await fetch(`${base}/api/update`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: dbUser._id.toString(), name: "NoAuth" }),
});
const forbiddenUpdateRes = await fetch(`${base}/api/update`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ id: "64f000000000000000000000", name: "OtherUser" }),
});
const ownUpdateRes = await fetch(`${base}/api/update`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ id: dbUser._id.toString(), name: "UpdatedName" }),
});
const unauthDeleteRes = await fetch(
  `${base}/api/delete/${dbUser._id.toString()}`,
  {
    method: "DELETE",
  }
);
const forbiddenDeleteRes = await fetch(
  `${base}/api/delete/64f000000000000000000000`,
  {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }
);
const ownDeleteRes = await fetch(
  `${base}/api/delete/${dbUser._id.toString()}`,
  {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }
);

console.log(
  JSON.stringify(
    {
      signupStatus: signupRes.status,
      signupMessage: signupJson.message,
      storedHash: Boolean(dbUser?.password?.startsWith("$2")),
      wrongPasswordStatus: badSigninRes.status,
      signinStatus: goodSigninRes.status,
      accessTokenPresent: Boolean(goodSigninJson.data?.accessToken),
      unauthUpdateStatus: unauthUpdateRes.status,
      forbiddenUpdateStatus: forbiddenUpdateRes.status,
      ownUpdateStatus: ownUpdateRes.status,
      unauthDeleteStatus: unauthDeleteRes.status,
      forbiddenDeleteStatus: forbiddenDeleteRes.status,
      ownDeleteStatus: ownDeleteRes.status,
    },
    null,
    2
  )
);

await mongoose.disconnect();
