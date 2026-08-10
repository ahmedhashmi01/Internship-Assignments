import jwt from "jsonwebtoken";

const authenticateAccessToken = (request, response, next) => {
  try {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader) {
      return response.status(401).json({
        code: "ACCESS_TOKEN_MISSING",
        message: "Authentication is required",
      });
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return response.status(401).json({
        code: "INVALID_AUTHORIZATION_FORMAT",
        message: "Authorization must use the Bearer scheme",
      });
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (decodedToken.type !== "access") {
      return response.status(401).json({
        code: "INVALID_ACCESS_TOKEN",
        message: "Invalid access token",
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
        code: "ACCESS_TOKEN_EXPIRED",
        message: "Access token has expired",
      });
    }

    return response.status(401).json({
      code: "INVALID_ACCESS_TOKEN",
      message: "Invalid access token",
    });
  }
};

export default authenticateAccessToken;
