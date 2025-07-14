const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// POST /api/orders
router.post('/', async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      address,
      city,
      county,
      items,
      total_amount
    } = req.body;

    // ✅ Basic validation
    if (!full_name || !phone || !address || !city || !county || !items || !total_amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Optional: You can also validate items is an array and total_amount is a number

    const { data, error } = await supabase
      .from('orders')
      .insert([{
        full_name,
        email,
        phone,
        address,
        city,
        county,
        items,
        total_amount,
        status: 'pending' // default
      }])
      .select();

    if (error) throw error;

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
