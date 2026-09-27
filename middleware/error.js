export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Not found: ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let status = err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  let { message } = err;

  if (err.name === 'CastError') {
    status = 404;
    message = 'Resource not found';
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || err.keyPattern || {})[0];
    message = field === 'email' ? 'An account with this email already exists' : `A record with this ${field || 'value'} already exists`;
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'File is too large (max 25 MB)';
  }

  if (status >= 500) console.error(err);
  res.status(status).json({
    message: message || 'Server error',
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: status >= 500 ? err.stack : undefined }),
  });
};
