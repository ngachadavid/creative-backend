const express = require('express')
const router = express.Router()
const supabase = require('../supabaseClient')
const multer = require('multer')

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'), false)
    }
  }
})

// Configure multer for single file upload
const uploadSingle = upload.single('image')

// Helper function to upload image to Supabase storage
const uploadImageToSupabase = async (file, folder = 'submissions') => {
  try {
    const fileExt = file.originalname.split('.').pop()
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const fileName = `${timestamp}-${randomSuffix}.${fileExt}`
    const filePath = `${folder}/${fileName}`

    const { data, error } = await supabase.storage
      .from('product-images') // Using same bucket as products
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      })

    if (error) throw error

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath)

    return publicUrl
  } catch (error) {
    throw new Error(`Image upload failed: ${error.message}`)
  }
}

// Helper function to delete image from Supabase storage
const deleteImageFromSupabase = async (imageUrl) => {
  try {
    // Extract file path from URL
    const urlParts = imageUrl.split('/product-images/')
    if (urlParts.length < 2) return

    const filePath = urlParts[1]
    
    const { error } = await supabase.storage
      .from('product-images')
      .remove([filePath])

    if (error) console.error('Error deleting image:', error)
  } catch (error) {
    console.error('Error deleting image:', error)
  }
}

// POST /api/submissions
router.post('/', uploadSingle, async (req, res) => {
  try {
    console.log('Submission POST request received:', req.body)
    console.log('File:', req.file)
    
    const {
      full_name,
      email,
      phone,
      address,
      title,
      year,
      medium,
      dimensions,
      price
    } = req.body

    // Required fields check
    if (!full_name || !email || !title) {
      return res.status(400).json({ error: 'Full name, email, and title are required.' })
    }

    let imageUrl = null
    
    // Handle image upload
    if (req.file) {
      console.log('Uploading submission image...')
      imageUrl = await uploadImageToSupabase(req.file)
      console.log('Submission image uploaded:', imageUrl)
    }

    console.log('Inserting submission into database:', {
      full_name, email, title, imageUrl
    })

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
          image_url: imageUrl,
          status: 'pending' 
        }
      ])
      .select()
      .single()

    console.log('Insert result:', { data, error })

    if (error) {
      console.error('Detailed insert error:', error)
      throw error
    }

    res.status(201).json(data)
  } catch (err) {
    console.error('Full error in submissions POST:', err)
    
    // Clean up uploaded image if database insert fails
    if (imageUrl) await deleteImageFromSupabase(imageUrl)
    
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

// DELETE /api/submissions/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Get submission to delete associated image
    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select('image_url')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Delete submission from database
    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Delete associated image from storage
    if (submission.image_url) {
      await deleteImageFromSupabase(submission.image_url)
    }

    res.json({ message: 'Submission deleted successfully' })
  } catch (err) {
    console.error('Error deleting submission:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router