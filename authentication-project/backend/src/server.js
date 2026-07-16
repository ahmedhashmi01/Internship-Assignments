import express from "express";
import cors from "cors";
import "dotenv/config";
import {
  validateSignup,
  validateSignin,
  validateUpdateUser,
  validateDeleteUser,
} from "./utils/validateUser.js";
import errorHandler from "./middleware/errorHandler.js";
import connectDatabase from "./config/database.js";
import User from "./models/User.js";
import prisma from "./lib/prisma.js";
import cookieParser from "cookie-parser";
import {
  generateAccessToken,
  generateRefreshToken,
} from "./utils/tokenUtils.js";
import { refreshCookieOptions } from "./utils/cookieOptions.js";
import jwt from "jsonwebtoken";
import authenticateAccessToken from "./middleware/authenticateAccessToken.js";
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.get("/", (request, response) => {
  return response.status(200).send("Authentication API is running");
});

app.get("/api/users", authenticateAccessToken, async (request, response) => {
  try {
    const users = await User.find().select("-password");

    return response.status(200).json({
      message: "Users retrieved successfully",
      users,
    });
  } catch (error) {
    console.error("Get users error:", error);

    return response.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/api/signup", async (request, response, next) => {
  try {
    const { name, email, password } = request.body;

    validateSignup({
      name,
      email,
      password,
    });

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      const error = new Error("Email already exists");
      error.statusCode = 409;

      throw error;
    }

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
    });

    return response.status(201).json({
      message: "User created successfully",
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/signin", async (request, response, next) => {
  try {
    const { email, password } = request.body;

    validateSignin({
      email,
      password,
    });

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user || user.password !== password) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;

      throw error;
    }
    // 1. Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    response.cookie("refreshToken", refreshToken, refreshCookieOptions);

    return response.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/update", async (request, response, next) => {
  try {
    const { id, name, email, password } = request.body;

    validateUpdateUser({
      id,
      name,
      email,
      password,
    });

    const user = await User.findById(id);

    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;

      throw error;
    }

    if (name) {
      user.name = name.trim();
    }

    if (email) {
      user.email = email.toLowerCase().trim();
    }

    if (password) {
      user.password = password;
    }

    const updatedUser = await user.save();

    return response.status(200).json({
      message: "User updated successfully",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.delete(
  "/api/delete/:id",
  authenticateAccessToken,
  async (request, response, next) => {
    try {
      const { id } = request.params;

      validateDeleteUser({ id });

      const deletedUser = await prisma.user.delete({
        where: {
          id,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      return response.status(200).json({
        message: "User deleted successfully",
        user: deletedUser,
      });
    } catch (error) {
      if (error.code === "P2025") {
        error.message = "User not found";
        error.statusCode = 404;
      }

      next(error);
    }
  }
);
// eslint-disable-next-line no-unused-vars
app.post("/api/auth/refresh", async (request, response, next) => {
  try {
    console.log("/api/auth/refresh cookies:", request.cookies);
    console.log("/api/auth/refresh header cookie:", request.headers.cookie);

    const refreshToken = request.cookies.refreshToken;

    if (!refreshToken) {
      return response.status(401).json({
        code: "REFRESH_TOKEN_MISSING",
        message: "Refresh token is required",
      });
    }

    const decodedToken = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    if (decodedToken.type !== "refresh") {
      return response.status(401).json({
        code: "INVALID_REFRESH_TOKEN",
        message: "Invalid refresh token",
      });
    }

    const user = await User.findById(decodedToken.userId);

    if (!user) {
      return response.status(401).json({
        code: "USER_NOT_FOUND",
        message: "The authenticated user no longer exists",
      });
    }

    const newAccessToken = generateAccessToken(user);

    return response.status(200).json({
      success: true,

      data: {
        accessToken: newAccessToken,

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      },
    });
  } catch (error) {
    console.error("/api/auth/refresh verify error:", error.name, error.message);
    response.clearCookie("refreshToken", refreshCookieOptions);

    if (error.name === "TokenExpiredError") {
      return response.status(401).json({
        code: "REFRESH_TOKEN_EXPIRED",
        message: "Refresh token has expired",
      });
    }

    return response.status(401).json({
      code: "INVALID_REFRESH_TOKEN",
      message: "Invalid refresh token",
    });
  }
});

app.post("/api/auth/logout", (request, response) => {
  response.clearCookie("refreshToken", refreshCookieOptions);

  return response.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});
app.use(errorHandler);
const startServer = async () => {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
