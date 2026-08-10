import bcrypt from "bcrypt";
import cors from "cors";
import express from "express";

import "dotenv/config";
import jwt from "jsonwebtoken";

import connectDatabase from "./config/database.js";
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
} from "./constants/authConstants.js";
import authenticateAccessToken from "./middleware/authenticateAccessToken.js";
import errorHandler from "./middleware/errorHandler.js";
import User from "./models/User.js";

import cookieParser from "cookie-parser";

import { refreshCookieOptions } from "./utils/cookieOptions.js";
import { httpLogger, logger } from "./utils/logger.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "./utils/tokenUtils.js";
import {
  validateSignup,
  validateSignin,
  validateUpdateUser,
  validateDeleteUser,
} from "./utils/validateUser.js";
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(httpLogger);
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.get("/", (request, response) => {
  return response.status(200).send("Authentication API is running");
});

app.get(
  "/api/users",
  authenticateAccessToken,
  async (request, response, next) => {
    try {
      const users = await User.find().select("-password");

      request.log.info(
        {
          route: request.originalUrl,
          method: request.method,
          userId: request.user?.id,
          statusCode: 200,
          requestId: request.id,
        },
        "Users retrieved successfully"
      );

      return response.status(200).json({
        message: "Users retrieved successfully",
        users,
      });
    } catch (error) {
      next(error);
    }
  }
);

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

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
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

    if (!user) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;

      throw error;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;

      throw error;
    }
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

app.patch(
  "/api/update",
  authenticateAccessToken,
  async (request, response, next) => {
    try {
      const { id, name, email, password } = request.body;

      validateUpdateUser({
        id,
        name,
        email,
        password,
      });

      if (request.user.id !== id) {
        const error = new Error("Forbidden");
        error.statusCode = 403;

        throw error;
      }

      const user = await User.findById(id);

      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;

        throw error;
      }

      if (email) {
        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: id },
        });

        if (existingUser) {
          const error = new Error("Email already exists");
          error.statusCode = 409;

          throw error;
        }

        user.email = normalizedEmail;
      }

      if (name) {
        user.name = name.trim();
      }

      if (password) {
        user.password = await bcrypt.hash(password, 10);
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
  }
);

app.delete(
  "/api/delete/:id",
  authenticateAccessToken,
  async (request, response, next) => {
    try {
      const { id } = request.params;

      validateDeleteUser({ id });

      if (request.user.id !== id) {
        const error = new Error("Forbidden");
        error.statusCode = 403;

        throw error;
      }

      const deletedUser = await User.findByIdAndDelete(id);

      if (!deletedUser) {
        const error = new Error("User not found");
        error.statusCode = 404;

        throw error;
      }

      return response.status(200).json({
        message: "User deleted successfully",
        user: {
          id: deletedUser._id,
          name: deletedUser.name,
          email: deletedUser.email,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
// eslint-disable-next-line no-unused-vars
app.post("/api/auth/refresh", async (request, response, next) => {
  try {
    request.log.debug(
      {
        route: request.originalUrl,
        method: request.method,
        requestId: request.id,
        headers: {
          host: request.headers.host,
          accept: request.headers.accept,
        },
      },
      "auth refresh request received"
    );

    const refreshToken = request.cookies.refreshToken;

    if (!refreshToken) {
      return response.status(401).json({
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_MISSING,
        message: AUTH_ERROR_MESSAGES.REFRESH_TOKEN_REQUIRED,
      });
    }

    const decodedToken = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    if (decodedToken.type !== "refresh") {
      return response.status(401).json({
        code: AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
        message: AUTH_ERROR_MESSAGES.INVALID_REFRESH_TOKEN,
      });
    }

    const user = await User.findById(decodedToken.userId);

    if (!user) {
      return response.status(401).json({
        code: AUTH_ERROR_CODES.USER_NOT_FOUND,
        message: AUTH_ERROR_MESSAGES.USER_NOT_FOUND,
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
    response.clearCookie("refreshToken", refreshCookieOptions);

    request.log.warn(
      {
        route: request.originalUrl,
        method: request.method,
        error: error.message,
        userId: request.user?.id,
        requestId: request.id,
        statusCode: 401,
      },
      "/api/auth/refresh verify failed"
    );

    if (error.name === "TokenExpiredError") {
      return response.status(401).json({
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_EXPIRED,
        message: AUTH_ERROR_MESSAGES.REFRESH_TOKEN_EXPIRED,
      });
    }

    return response.status(401).json({
      code: AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
      message: AUTH_ERROR_MESSAGES.INVALID_REFRESH_TOKEN,
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
    logger.info(
      {
        route: "server.start",
        method: "INIT",
        statusCode: 200,
        port: PORT,
      },
      "Server running"
    );
  });
};

startServer();
