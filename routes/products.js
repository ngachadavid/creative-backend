const express = require('express')
const router = express.Router()
const supabase = require('../supabaseClient')
const verifyAdmin = require('../middleware/verifyAdmin')
const multer = require('multer')

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'), false)
    }
  }
})

// Helper function to upload image to Supabase storage
const uploadImageToSupabase = async (file, folder = 'products') => {
  try {
    const fileExt = file.originalname.split('.').pop()
    const timestamp = Date.now()
    const fileName = `${timestamp}-${file.originalname}`
    const filePath = `${folder}/${fileName}`

    const { data, error } = await supabase.storage
      .from('product-images') // Make sure this bucket exists in Supabase
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
router.post('/', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category_id, images, size } = req.body
    
    if (!name || isNaN(price)) {
      return res.status(400).json({ error: 'Name and valid price are required.' })
    }

    let imageUrl = null
    
    // Handle image upload
    if (req.file) {
      imageUrl = await uploadImageToSupabase(req.file)
    }

    // Parse arrays if they come as strings
    const parsedImages = images ? (typeof images === 'string' ? JSON.parse(images) : images) : []
    const parsedSize = size ? (typeof size === 'string' ? JSON.parse(size) : size) : []

    const { data, error } = await supabase
      .from('products')
      .insert([{ 
        name, 
        description, 
        price, 
        category_id, 
        image: imageUrl, 
        images: parsedImages, 
        size: parsedSize 
      }])
      .select()

    if (error) throw error

    res.status(201).json(data?.[0] || { message: 'Product created successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/products/:id
router.put('/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, price, category_id, images, size } = req.body

    // Get current product to check for existing image
    const { data: currentProduct, error: fetchError } = await supabase
      .from('products')
      .select('image')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    let imageUrl = currentProduct.image // Keep existing image by default

    // Handle new image upload
    if (req.file) {
      // Delete old image if it exists
      if (currentProduct.image) {
        await deleteImageFromSupabase(currentProduct.image)
      }
      
      // Upload new image
      imageUrl = await uploadImageToSupabase(req.file)
    }

    // Parse arrays if they come as strings
    const parsedImages = images ? (typeof images === 'string' ? JSON.parse(images) : images) : []
    const parsedSize = size ? (typeof size === 'string' ? JSON.parse(size) : size) : []

    const { data, error } = await supabase
      .from('products')
      .update({ 
        name, 
        description, 
        price, 
        category_id, 
        image: imageUrl, 
        images: parsedImages, 
        size: parsedSize 
      })
      .eq('id', id)
      .select()

    if (error) throw error

    res.json(data?.[0] || { message: 'Product updated.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/products/:id
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Get product to delete associated image
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('image')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Delete product from database
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Delete associated image from storage
    if (product.image) {
      await deleteImageFromSupabase(product.image)
    }

    res.json({ message: 'Product deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router