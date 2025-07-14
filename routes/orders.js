const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const verifyAdmin = require('../middleware/verifyAdmin');

// GET /api/orders
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Order not found' });
  }
});


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

// PUT /api/orders/:id
router.put('/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) return res.status(400).json({ error: 'Status is required' });

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
