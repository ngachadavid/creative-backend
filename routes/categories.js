const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const verifyAdmin = require('../middleware/verifyAdmin');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Helper: get public URL from storage
const getPublicUrl = (path) => {
  const { data } = supabase.storage.from('category-images').getPublicUrl(path);
  return data.publicUrl;
};

// GET all categories
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET single category
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Category not found' });
  }
});

// CREATE category
router.post('/', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    let image_url = null;

    if (req.file) {
      const fileName = `${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from('category-images')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (uploadError) throw uploadError;
      image_url = getPublicUrl(fileName);
    }

    const { data, error } = await supabase
      .from('categories')
      .insert([{ name, image_url }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE category
router.put('/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Fetch existing category first
    const { data: existing, error: fetchError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    let image_url = existing.image_url;

    // If new image uploaded
    if (req.file) {
      const fileName = `${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from('category-images')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (uploadError) throw uploadError;
      image_url = getPublicUrl(fileName);
    }

    const { data, error } = await supabase
      .from('categories')
      .update({
        name: name || existing.name,
        image_url,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE category
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category has linked products
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id')
      .eq('category_id', id);

    if (prodError) throw prodError;

    if (products.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete category: products are still using this category.',
      });
    }

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
