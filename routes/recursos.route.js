const { Router } = require('express');
const multer = require('multer');
const { validarJWT } = require('../middlewares/validar-jwt');
const { subirRecurso, listarRecursos } = require('../controllers/recursos.controller');

// Configuración de Multer para mantener el archivo en memoria (Buffer)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25 MB máximo
});

const router = Router({ mergeParams: true });

// Subir recurso a un servicio (Protegido por token y rol de proveedor)
router.post('/', [
    validarJWT,
    upload.single('recurso')
], subirRecurso);

// Consultar recursos de un servicio
router.get('/', listarRecursos);

module.exports = router;