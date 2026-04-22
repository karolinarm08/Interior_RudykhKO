const jwt = require('jsonwebtoken');
require('dotenv').config();

function verifyAccessToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Немає токена доступу' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Недійсний або прострочений токен' });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Користувача не автентифіковано' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Недостатньо прав доступу' });
    }

    next();
  };
}

module.exports = { verifyAccessToken, allowRoles };