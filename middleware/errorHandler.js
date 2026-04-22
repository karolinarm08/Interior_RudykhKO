const { logError } = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logError(err, req);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    message: err.message || 'Внутрішня помилка сервера'
  });
}

module.exports = errorHandler;