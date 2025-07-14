const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()

app.use(cors())
app.use(express.json())

const productRoutes = require('./routes/products')
app.use('/api/products', productRoutes)

const categoryRoutes = require('./routes/categories')
app.use('/api/categories', categoryRoutes)

const adminAuthRoutes = require('./routes/adminAuth');
app.use('/api/admin', adminAuthRoutes);

const orderRoutes = require('./routes/orders');
app.use('/api/orders', orderRoutes);

const deliveryRoutes = require('./routes/delivery');
app.use('/api/delivery-fees', deliveryRoutes);

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
