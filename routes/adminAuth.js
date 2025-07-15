const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Admin Signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) return res.status(400).json({ error: error.message });

  res.status(200).json({ message: 'Admin signup successful', data });
});

// Admin Token Verification
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.status(200).json({ message: 'Token valid', user });
  } catch (err) {
    res.status(401).json({ error: 'Token verification failed' });
  }
});

// Admin Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return res.status(401).json({ error: error.message });

  // Return the access token
  res.status(200).json({ 
    message: 'Admin login successful', 
    token: data.session.access_token,
    data 
  });
});

module.exports = router;
