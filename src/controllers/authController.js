const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const { parsePagination, paginationMeta } = require('../utils/pagination');

const getJwtSecret = () => {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('Server misconfiguration: JWT_SECRET is missing');
  }
  return secret;
};

const generateToken = (id) =>
  jwt.sign({ id }, getJwtSecret(), { expiresIn: process.env.JWT_EXPIRE || '30d' });

// Register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, subject, phone } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    const user = await User.create({ name, email, password, role, subject, phone });
    const token = generateToken(user._id);

    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    const token = generateToken(user._id);

    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Profile
exports.getProfile = async (req, res) => {
  res.json(req.user);
};

// Get all students (teacher only) — paginated + searchable
exports.getAllStudents = async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Only teachers can access student list' });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const filter = { role: 'student' };

    // Optional full-text-style search on name or email
    if (req.query.search) {
      const re = new RegExp(req.query.search, 'i');
      filter.$or = [{ name: re }, { email: re }];
    }

    const [students, total] = await Promise.all([
      User.find(filter)
        .select('name email phone avatar subject createdAt')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({ data: students, pagination: paginationMeta(page, limit, total) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};