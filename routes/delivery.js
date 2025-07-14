const express = require('express');
const router = express.Router();
const deliveryFees = require('../utils/deliveryFee')

router.get('/', (req, res) => {
  res.json(deliveryFees);
});

module.exports = router;
