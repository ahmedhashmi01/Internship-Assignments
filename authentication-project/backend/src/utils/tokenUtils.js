import jwt from "jsonwebtoken";

const refresh_time = "5d";
const access_time = "2d";
export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id || user._id.toString(),
      email: user.email,
      type: "access",
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || access_time,
    }
  );
};

export const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user.id || user._id.toString(),
      type: "refresh",
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || refresh_time,
    }
  );
};
