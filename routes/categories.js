const express = require('express')
const router = express.Router()
const supabase = require('../supabaseClient')

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('*')
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/categories/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(404).json({ error: 'Category not found' })
  }
})

// POST /api/categories
router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    
    const { data, error } = await supabase
      .from('categories')
      .insert([{ name }])
      .select()
    
    if (error) throw error
    
    if (data && data.length > 0) {
      res.status(201).json(data[0])
    } else {
      res.status(201).json({ message: 'Category created successfully' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/categories/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name } = req.body

  if (!name) return res.status(400).json({ error: 'Name is required' })

  try {
    const { data, error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// DELETE /api/categories/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params

  try {
    // Check if any products are using this category
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('category', id)

    if (productError) throw productError

    if (products.length > 0) {
      return res.status(400).json({ error: 'Cannot delete category: products are still using this category.' })
    }

    // Safe to delete
    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError

    res.json({ message: 'Category deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


module.exports = router