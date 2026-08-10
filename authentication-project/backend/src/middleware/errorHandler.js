// eslint-disable-next-line no-unused-vars
const errorHandler = (error, request, response, next) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : error.message;

  const logMeta = {
    route: request.originalUrl,
    method: request.method,
    statusCode,
    userId: request.user?.id,
    requestId: request.id,
  };

  if (statusCode >= 500) {
    request.log.error({ ...logMeta, stack: error.stack }, error.message);
  } else if (statusCode >= 400) {
    request.log.warn(logMeta, error.message);
  } else {
    request.log.info(logMeta, error.message);
  }

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

  return response.status(statusCode).json({
    message,
  });
};

export default errorHandler;
