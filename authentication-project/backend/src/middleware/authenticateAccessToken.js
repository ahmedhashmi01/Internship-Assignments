import jwt from "jsonwebtoken";

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
} from "../constants/authConstants.js";

const authenticateAccessToken = (request, response, next) => {
  try {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader) {
      return response.status(401).json({
        code: AUTH_ERROR_CODES.ACCESS_TOKEN_MISSING,
        message: AUTH_ERROR_MESSAGES.AUTHENTICATION_REQUIRED,
      });
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return response.status(401).json({
        code: AUTH_ERROR_CODES.INVALID_AUTHORIZATION_FORMAT,
        message: AUTH_ERROR_MESSAGES.BEARER_SCHEME_REQUIRED,
      });
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (decodedToken.type !== "access") {
      return response.status(401).json({
        code: AUTH_ERROR_CODES.INVALID_ACCESS_TOKEN,
        message: AUTH_ERROR_MESSAGES.INVALID_ACCESS_TOKEN,
      });
    }

    request.user = {
      id: decodedToken.userId,
      email: decodedToken.email,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return response.status(401).json({
        code: AUTH_ERROR_CODES.ACCESS_TOKEN_EXPIRED,
        message: AUTH_ERROR_MESSAGES.ACCESS_TOKEN_EXPIRED,
      });
    }

    return response.status(401).json({
      code: AUTH_ERROR_CODES.INVALID_ACCESS_TOKEN,
      message: AUTH_ERROR_MESSAGES.INVALID_ACCESS_TOKEN,
    });
  }
};

export default authenticateAccessToken;
