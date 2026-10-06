const { Router } = require('express');
const { obtenerUbicaciones } = require('../controllers/ubicaciones.controller');

const router = Router();

router.get('/', obtenerUbicaciones);

module.exports = router;