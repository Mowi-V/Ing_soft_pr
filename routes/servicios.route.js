const { Router } = require('express');
const { check } = require('express-validator');

const { crearServicio } = require('../controllers/servicios.controller');
const { validarJWT, esProveedor } = require('../middlewares/validar-jwt');
const { validarCampos } = require('../middlewares/validar-campos');

const router = Router();

router.post('/', [
    validarJWT,
    esProveedor,
    check('nombre', 'El nombre del servicio es obligatorio').not().isEmpty(),
    check('descripcion', 'La descripción es obligatoria').not().isEmpty(),
    check('duracion_minutos', 'La duración debe ser un número entero mayor a 0').isInt({ min: 1 }),
    check('precio', 'El precio debe ser un valor numérico válido').isFloat({ min: 0 }),
    check('categoria', 'Categoría no permitida. Debe ser Estética, Bienestar o Masajes')
        .isIn(['Estética', 'Bienestar', 'Masajes']),     
    validarCampos
], crearServicio);

module.exports = router;