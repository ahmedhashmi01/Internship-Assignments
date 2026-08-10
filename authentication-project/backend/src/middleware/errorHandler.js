// eslint-disable-next-line no-unused-vars
const errorHandler = (error, request, response, next) => {
  console.error("Error from middleware:", error);

  if (error.name === "CastError") {
    return response.status(400).json({
      message: "Invalid user ID",
    });
  }

  if (error.code === 11000) {
    return response.status(409).json({
      message: "Email already exists",
    });
  }

  const statusCode = error.statusCode || 500;

  const message = statusCode === 500 ? "Internal server error" : error.message;

  return response.status(statusCode).json({
    message,
  });
};

export default errorHandler;
