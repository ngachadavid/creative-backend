const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const verifyAdmin = require('../middleware/verifyAdmin');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // Handle file uploads in memory

// Helper function to get public URL for an uploaded file
const getPublicUrl = (path) => {
  const { data } = supabase.storage.from('category-images').getPublicUrl(path);
  return data.publicUrl;
};

// GET /api/categories - fetch all categories
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categories/:id - fetch single category
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Category not found' });
  }
});

// POST /api/categories - create category with optional image
router.post('/', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    let image_url = null;

    // If file is provided, upload to Supabase Storage
    if (req.file) {
      const fileName = `${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from('category-images')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) throw uploadError;
      image_url = getPublicUrl(fileName);
    }

    const { data, error } = await supabase
      .from('categories')
      .insert([{ name, image_url }])
      .select();

    if (error) throw error;

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/categories/:id - update name and/or image
router.put('/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  let image_url;

  try {
    // If new image is uploaded
    if (req.file) {
      const fileName = `${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from('category-images')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) throw uploadError;
      image_url = getPublicUrl(fileName);
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (image_url) updateData.image_url = image_url;

    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/categories/:id - safe delete (only if no products use it)
router.delete('/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if products are linked to this category
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('category_id', id);

    if (productError) throw productError;

    if (products.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete category: products are still using this category.',
      });
    }

    // Delete the category
    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
