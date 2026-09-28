const { Router } = require('express');
const { check } = require('express-validator');

const { 
    obtenerPerfilProveedor, 
    actualizarPerfilProveedor, 
    registrarZonaAtencion 
} = require('../controllers/proveedores.controller');

const { validarJWT, esProveedor } = require('../middlewares/validar-jwt');
const { validarCampos } = require('../middlewares/validar-campos');

const router = Router();

router.get('/perfil', [
    validarJWT,
    esProveedor
], obtenerPerfilProveedor);

router.put('/perfil', [
    validarJWT,
    esProveedor,
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('apellido', 'El apellido es obligatorio').not().isEmpty(),
    check('descripcion_perfil', 'La descripción del perfil es obligatoria').not().isEmpty(),
    validarCampos
], actualizarPerfilProveedor);

router.post('/zonas', [
    validarJWT,
    esProveedor,
    check('ciudad', 'La ciudad es obligatoria').not().isEmpty(),
    check('barrio_sector', 'El barrio o sector es obligatorio').not().isEmpty(),
    validarCampos
], registrarZonaAtencion);

module.exports = router;