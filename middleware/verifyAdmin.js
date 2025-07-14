const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function verifyAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);

    // Optional: You can check role here if needed
    // if (decoded.role !== 'authenticated') return res.status(403).json({ error: 'Not allowed' });

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
