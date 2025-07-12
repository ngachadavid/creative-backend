const express = require('express')
const router = express.Router()
const supabase = require('../supabaseClient')

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories (
          id,
          name
        )
      `)

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories (
          id,
          name
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { name, description, price, category_id, image, images, size } = req.body

    if (!name || !image || isNaN(price)) {
      return res.status(400).json({ error: 'Name, image, and valid price are required.' })
    }

    const { data, error } = await supabase
      .from('products')
      .insert([{ name, description, price, category_id, image, images, size }])
      .select()

    if (error) throw error

    res.status(201).json(data?.[0] || { message: 'Product created successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, price, category_id, image, images, size } = req.body

    const { data, error } = await supabase
      .from('products')
      .update({ name, description, price, category_id, image, images, size })
      .eq('id', id)
      .select()

    if (error) throw error

    res.json(data?.[0] || { message: 'Product updated.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) throw error

    res.json({ message: 'Product deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
