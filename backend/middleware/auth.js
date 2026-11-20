const jwt = require('jsonwebtoken');

// auth() = login required, auth(false) = attach user when a valid token exists
module.exports = function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return required ? res.status(401).json({ error: 'Log in to do this' }) : next();
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      return required ? res.status(401).json({ error: 'Your session expired. Log in again' }) : next();
    }
  };
};
