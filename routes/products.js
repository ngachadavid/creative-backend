const express = require('express')
const router = express.Router()
const supabase = require('../supabaseClient')

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*')
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { name, description, price, category, image, images, size } = req.body

    // --- Basic Validation ---
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Product name is required' })
    }

    if (!price || isNaN(price) || Number(price) <= 0) {
      return res.status(400).json({ error: 'Price must be a valid number greater than 0' })
    }

    if (!image || image.trim() === '') {
      return res.status(400).json({ error: 'Main image URL is required' })
    }

    // --- Insert Product ---
    const { data, error } = await supabase
      .from('products')
      .insert([
        { name, description, price, category, image, images, size }
      ])
      .select()

    if (error) throw error

    if (data && data.length > 0) {
      res.status(201).json(data[0])
    } else {
      res.status(201).json({ message: 'Product created successfully' })
    }

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


module.exports = router
