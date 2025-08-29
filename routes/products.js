const express = require('express')
const router = express.Router()
const supabase = require('../supabaseClient')
const verifyAdmin = require('../middleware/verifyAdmin')
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

// Configure multer for multiple files
const uploadMultiple = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'additionalImages', maxCount: 10 } // Allow up to 10 additional images
])

// Helper function to upload image to Supabase storage
const uploadImageToSupabase = async (file, folder = 'products') => {
  try {
    const fileExt = file.originalname.split('.').pop()
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const fileName = `${timestamp}-${randomSuffix}.${fileExt}`
    const filePath = `${folder}/${fileName}`

    const { data, error } = await supabase.storage
      .from('product-images') 
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

// Helper function to delete multiple images
const deleteMultipleImages = async (imageUrls) => {
  if (!Array.isArray(imageUrls)) return
  
  const deletePromises = imageUrls.map(url => deleteImageFromSupabase(url))
  await Promise.all(deletePromises)
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
       .order('created_at', { ascending: false })

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

// POST /api/products - add better error logging
router.post('/', verifyAdmin, uploadMultiple, async (req, res) => {
  try {
    console.log('POST request received:', req.body)
    console.log('Files:', req.files)
    
    const { name, description, price, category_id, size } = req.body
    
    if (!name || isNaN(price)) {
      return res.status(400).json({ error: 'Name and valid price are required.' })
    }

    let imageUrl = null
    let additionalImagesUrls = []
    
    // Handle main image upload
    if (req.files && req.files.image && req.files.image[0]) {
      console.log('Uploading main image...')
      imageUrl = await uploadImageToSupabase(req.files.image[0])
      console.log('Main image uploaded:', imageUrl)
    }

    // Handle additional images upload
    if (req.files && req.files.additionalImages) {
      console.log('Uploading additional images...')
      const uploadPromises = req.files.additionalImages.map(file => 
        uploadImageToSupabase(file)
      )
      additionalImagesUrls = await Promise.all(uploadPromises)
      console.log('Additional images uploaded:', additionalImagesUrls)
    }

    // Parse size array if it comes as string
    const parsedSize = size ? (typeof size === 'string' ? JSON.parse(size) : size) : []

    console.log('Inserting into database:', {
      name, description, price, category_id, imageUrl, additionalImagesUrls, parsedSize
    })

    const { data, error } = await supabase
      .from('products')
      .insert([{ 
        name, 
        description, 
        price, 
        category_id, 
        image: imageUrl, 
        images: additionalImagesUrls, 
        size: parsedSize 
      }])
      .select()

    console.log('Insert result:', { data, error })

    if (error) {
      console.error('Detailed insert error:', error)
      throw error
    }

    res.status(201).json(data?.[0] || { message: 'Product created successfully' })
  } catch (err) {
    console.error('Full error in POST:', err)
    
    // Clean up uploaded images if database insert fails
    if (imageUrl) await deleteImageFromSupabase(imageUrl)
    if (additionalImagesUrls.length > 0) await deleteMultipleImages(additionalImagesUrls)
    
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/products/:id - simplified version
router.put('/:id', verifyAdmin, uploadMultiple, async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, price, category_id, size, existingImages } = req.body

    console.log('Update request received:', { id, name, price, category_id, existingImages })
    console.log('Files received:', req.files)

    // Get current product
    const { data: currentProduct, error: fetchError } = await supabase
      .from('products')
      .select('image, images')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    let imageUrl = currentProduct.image
    let finalAdditionalImages = []

    // Handle main image
    if (req.files && req.files.image && req.files.image[0]) {
      console.log('Processing main image upload...')
      if (currentProduct.image) {
        await deleteImageFromSupabase(currentProduct.image)
      }
      imageUrl = await uploadImageToSupabase(req.files.image[0])
      console.log('New main image URL:', imageUrl)
    }

    // Handle additional images
    const existingImagesArray = existingImages ? JSON.parse(existingImages) : []
    finalAdditionalImages = [...existingImagesArray]

    const currentImages = currentProduct.images || []
    const imagesToDelete = currentImages.filter(img => !existingImagesArray.includes(img))
    
    if (imagesToDelete.length > 0) {
      console.log('Deleting images:', imagesToDelete)
      await deleteMultipleImages(imagesToDelete)
    }

    if (req.files && req.files.additionalImages) {
      console.log('Processing additional images upload...')
      const uploadPromises = req.files.additionalImages.map(file => 
        uploadImageToSupabase(file)
      )
      const newImageUrls = await Promise.all(uploadPromises)
      finalAdditionalImages = [...finalAdditionalImages, ...newImageUrls]
      console.log('New additional images:', newImageUrls)
    }

    const parsedSize = size ? (typeof size === 'string' ? JSON.parse(size) : size) : []

    console.log('Final data to update:', {
      name, 
      description, 
      price: parseFloat(price), 
      category_id: parseInt(category_id),
      image: imageUrl,
      images: finalAdditionalImages,
      size: parsedSize
    })

    // Use direct update instead of RPC
    const { data, error } = await supabase
      .from('products')
      .update({ 
        name, 
        description, 
        price: parseFloat(price), 
        category_id: parseInt(category_id),
        image: imageUrl,
        images: finalAdditionalImages,
        size: parsedSize,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()

    console.log('Update response:', { data, error })

    if (error) {
      console.error('Supabase update error details:', error)
      throw error
    }

    res.json(data?.[0] || { message: 'Product updated successfully' })
  } catch (err) {
    console.error('Update error details:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/products/:id
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Get product to delete associated images
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('image, images')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Delete product from database
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Delete associated images from storage
    if (product.image) {
      await deleteImageFromSupabase(product.image)
    }
    
    if (product.images && product.images.length > 0) {
      await deleteMultipleImages(product.images)
    }

    res.json({ message: 'Product deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router