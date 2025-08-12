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

// Configure multer for single file upload
const uploadSingle = upload.single('image')

// Helper function to upload image to Supabase storage
const uploadImageToSupabase = async (file, folder = '') => {
  try {
    const fileExt = file.originalname.split('.').pop()
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const fileName = `${timestamp}-${randomSuffix}.${fileExt}`
    const filePath = folder ? `${folder}/${fileName}` : fileName

    const { data, error } = await supabase.storage
      .from('category-images')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      })

    if (error) throw error

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('category-images') // Changed from 'product-images'
      .getPublicUrl(filePath)

    return publicUrl
  } catch (error) {
    throw new Error(`Image upload failed: ${error.message}`)
  }
}

// Helper function to delete image from Supabase storage
const deleteImageFromSupabase = async (imageUrl) => {
  try {
    if (!imageUrl) return

    // Extract file path from URL
    const urlParts = imageUrl.split('/category-images/') // Changed from '/product-images/'
    if (urlParts.length < 2) return

    const filePath = urlParts[1]
    
    const { error } = await supabase.storage
      .from('category-images') // Changed from 'product-images'
      .remove([filePath])

    if (error) console.error('Error deleting image:', error)
  } catch (error) {
    console.error('Error deleting image:', error)
  }
}

// GET /api/categories - Get all categories
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/categories/:id - Get single category
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    if (!data) {
      return res.status(404).json({ error: 'Category not found' })
    }

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/categories/:id/products - Get all products in a category
router.get('/:id/products', async (req, res) => {
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
      .eq('category_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/categories - Create new category
router.post('/', verifyAdmin, uploadSingle, async (req, res) => {
  try {
    const { name } = req.body
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Category name is required.' })
    }

    // Check if category with same name already exists
    const { data: existingCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('name', name.trim())
      .single()

    if (existingCategory) {
      return res.status(400).json({ error: 'Category with this name already exists.' })
    }

    let imageUrl = null
    
    // Handle image upload
    if (req.file) {
      try {
        imageUrl = await uploadImageToSupabase(req.file)
      } catch (uploadError) {
        return res.status(500).json({ error: uploadError.message })
      }
    }

    const { data, error } = await supabase
      .from('categories')
      .insert([{ 
        name: name.trim(), 
        image: imageUrl
      }])
      .select()

    if (error) {
      // Clean up uploaded image if database insert fails
      if (imageUrl) {
        await deleteImageFromSupabase(imageUrl)
      }
      throw error
    }

    res.status(201).json(data?.[0] || { message: 'Category created successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/categories/:id - Update category
router.put('/:id', verifyAdmin, uploadSingle, async (req, res) => {
  try {
    const { id } = req.params
    const { name } = req.body

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Category name is required.' })
    }

    // Check if another category with same name exists (excluding current category)
    const { data: existingCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('name', name.trim())
      .neq('id', id)
      .single()

    if (existingCategory) {
      return res.status(400).json({ error: 'Another category with this name already exists.' })
    }

    // Get current category to handle image replacement
    const { data: currentCategory, error: fetchError } = await supabase
      .from('categories')
      .select('image')
      .eq('id', id)
      .single()

    if (fetchError) {
      return res.status(404).json({ error: 'Category not found' })
    }

    let imageUrl = currentCategory.image

    // Handle new image upload
    if (req.file) {
      try {
        // Upload new image
        const newImageUrl = await uploadImageToSupabase(req.file)
        
        // Delete old image if it exists
        if (currentCategory.image) {
          await deleteImageFromSupabase(currentCategory.image)
        }
        
        imageUrl = newImageUrl
      } catch (uploadError) {
        return res.status(500).json({ error: uploadError.message })
      }
    }

    const { data, error } = await supabase
      .from('categories')
      .update({ 
        name: name.trim(),
        image: imageUrl
      })
      .eq('id', id)
      .select()

    if (error) throw error

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Category not found' })
    }

    res.json(data[0])
  } catch (err) {
    console.error('Update error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/categories/:id - Delete category
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Check if category has any products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id')
      .eq('category_id', id)
      .limit(1)

    if (productsError) throw productsError

    if (products && products.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category. It contains products. Please move or delete all products first.' 
      })
    }

    // Get category to delete associated image
    const { data: category, error: fetchError } = await supabase
      .from('categories')
      .select('image')
      .eq('id', id)
      .single()

    if (fetchError) {
      return res.status(404).json({ error: 'Category not found' })
    }

    // Delete category from database
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Delete associated image from storage
    if (category.image) {
      await deleteImageFromSupabase(category.image)
    }

    res.json({ message: 'Category deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router