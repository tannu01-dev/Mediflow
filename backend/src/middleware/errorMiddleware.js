function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || err.status || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || "Internal server error";

  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Request body contains invalid JSON";
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Request body is too large";
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Submitted data failed validation";
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "One or more supplied identifiers or values are invalid";
  } else if (err.code === 11000) {
    statusCode = 409;
    message = "A record with these unique details already exists";
  }

  if (statusCode >= 500) {
    console.error("API error", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      message: err.message,
    });
    if (process.env.NODE_ENV !== "development") message = "Internal server error";
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(req.requestId ? { requestId: req.requestId } : {}),
    ...(process.env.NODE_ENV === "development" && statusCode >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = { notFound, errorHandler };
