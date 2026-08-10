import jwt from "jsonwebtoken";

export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id || user._id.toString(),
      email: user.email,
      type: "access",
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "2d",
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
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "5d",
    }
  );
};
