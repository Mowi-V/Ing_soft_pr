const { Router } = require('express');
const { check } = require('express-validator');
const { 
    crearServicio, 
    listarServiciosCatalogo, 
    obtenerMisServicios, 
    actualizarServicio 
} = require('../controllers/servicios.controller');
const { validarJWT, esProveedor } = require('../middlewares/validar-jwt');
const { validarCampos } = require('../middlewares/validar-campos');

const router = Router();

router.get('/', listarServiciosCatalogo);

router.get('/mis-servicios', [
    validarJWT,
    esProveedor
], obtenerMisServicios);

router.post('/', [
    validarJWT,
    esProveedor,
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('descripcion', 'La descripción es obligatoria').not().isEmpty(),
    check('duracion_minutos', 'La duración debe ser válida').isInt({ min: 1 }),
    check('precio', 'El precio debe ser un número').isFloat({ min: 0 }),
    check('categoria', 'Categoría no permitida').isIn(['Estética', 'Bienestar', 'Masajes']),
    validarCampos
], crearServicio);

router.put('/:id', [
    validarJWT,
    esProveedor,
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('descripcion', 'La descripción es obligatoria').not().isEmpty(),
    check('duracion_minutos', 'La duración debe ser válida').isInt({ min: 1 }),
    check('precio', 'El precio debe ser un número').isFloat({ min: 0 }),
    check('categoria', 'Categoría no válida').isIn(['Estética', 'Bienestar', 'Masajes']),
    check('estado', 'Estado inválido').isIn(['A', 'I']),
    validarCampos
], actualizarServicio);

module.exports = router;