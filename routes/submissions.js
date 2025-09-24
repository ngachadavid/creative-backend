const express = require('express')
const router = express.Router()
const supabase = require('../supabaseClient')

// POST /api/submissions
router.post('/', async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      address,
      title,
      year,
      medium,
      dimensions,
      price,
      image_url
    } = req.body

    // Required fields check
    if (!full_name || !email || !title) {
      return res.status(400).json({ error: 'Full name, email, and title are required.' })
    }

    const { data, error } = await supabase
      .from('submissions')
      .insert([
        {
          full_name,
          email,
          phone,
          address,
          title,
          year,
          medium,
          dimensions,
          price,
          image_url,
          status: 'pending' // default
        }
      ])
      .select()
      .single()

    if (error) throw error

    res.status(201).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/submissions - fetch all submissions
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/submissions/:id - fetch single submission
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
module.exports = router
