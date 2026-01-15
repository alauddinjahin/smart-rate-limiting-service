const express = require('express');
const router = express.Router();

const usersRoutes = require('./api.routes');

router.use('/', usersRoutes);

module.exports = router;
