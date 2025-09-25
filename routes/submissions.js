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

// Configure multer for flexible upload (single or multiple)
const uploadFlexible = upload.fields([
  { name: 'image', maxCount: 1 },        // Single image (backwards compatibility)
  { name: 'images', maxCount: 10 }       // Multiple images (up to 10)
])

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

// Helper function to upload multiple images
const uploadMultipleImages = async (files, folder = 'submissions') => {
  const uploadPromises = files.map(file => uploadImageToSupabase(file, folder))
  return await Promise.all(uploadPromises)
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

// Helper function to delete multiple images
const deleteMultipleImages = async (imageUrls) => {
  if (!imageUrls || imageUrls.length === 0) return
  const deletePromises = imageUrls.map(url => deleteImageFromSupabase(url))
  await Promise.all(deletePromises)
}

// POST /api/submissions
router.post('/', uploadFlexible, async (req, res) => {
  try {
    console.log('Submission POST request received:', req.body)
    console.log('Files:', req.files)
    
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

    let imageUrls = []
    let uploadedUrls = [] // Track uploaded URLs for cleanup
    
    // Handle image uploads
    if (req.files) {
      try {
        // Handle single image (backwards compatibility)
        if (req.files.image && req.files.image.length > 0) {
          console.log('Uploading single image...')
          const imageUrl = await uploadImageToSupabase(req.files.image[0])
          imageUrls.push(imageUrl)
          uploadedUrls.push(imageUrl)
          console.log('Single image uploaded:', imageUrl)
        }
        
        // Handle multiple images
        if (req.files.images && req.files.images.length > 0) {
          console.log('Uploading multiple images...')
          const multipleUrls = await uploadMultipleImages(req.files.images)
          imageUrls.push(...multipleUrls)
          uploadedUrls.push(...multipleUrls)
          console.log('Multiple images uploaded:', multipleUrls)
        }
      } catch (uploadError) {
        // Clean up any uploaded images if there's an error
        await deleteMultipleImages(uploadedUrls)
        throw uploadError
      }
    }

    console.log('Inserting submission into database:', {
      full_name, email, title, imageUrls
    })

    // Store images as JSON array, but keep backwards compatibility
    const submissionData = {
      full_name,
      email,
      phone,
      address,
      title,
      year,
      medium,
      dimensions,
      price,
      status: 'pending'
    }

    // For backwards compatibility, store first image in image_url
    if (imageUrls.length > 0) {
      submissionData.image_url = imageUrls[0]
    }

    // Store all images in a new column (you'll need to add this column)
    if (imageUrls.length > 0) {
      submissionData.image_urls = imageUrls
    }

    const { data, error } = await supabase
      .from('submissions')
      .insert([submissionData])
      .select()
      .single()

    console.log('Insert result:', { data, error })

    if (error) {
      console.error('Detailed insert error:', error)
      // Clean up uploaded images if database insert fails
      await deleteMultipleImages(uploadedUrls)
      throw error
    }

    res.status(201).json(data)
  } catch (err) {
    console.error('Full error in submissions POST:', err)
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

    // Get submission to delete associated images
    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select('image_url, image_urls')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Delete submission from database
    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Delete associated images from storage
    const imagesToDelete = []
    
    // Add single image (backwards compatibility)
    if (submission.image_url) {
      imagesToDelete.push(submission.image_url)
    }
    
    // Add multiple images
    if (submission.image_urls && Array.isArray(submission.image_urls)) {
      imagesToDelete.push(...submission.image_urls)
    }
    
    // Remove duplicates and delete
    const uniqueImages = [...new Set(imagesToDelete)]
    await deleteMultipleImages(uniqueImages)

    res.json({ message: 'Submission deleted successfully' })
  } catch (err) {
    console.error('Error deleting submission:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router