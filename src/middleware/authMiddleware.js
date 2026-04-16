const jwt  = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    const jwtSecret = (process.env.JWT_SECRET || '').trim();
    if (!jwtSecret) {
      return res.status(500).json({ message: 'Server misconfiguration: JWT_SECRET is missing' });
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No bearer token provided' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, jwtSecret);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: `Invalid token: ${err.message}` });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};