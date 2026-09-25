const { Router } = require('express');
const { check } = require('express-validator');
const { registrarUsuario } = require('../controllers/usuarios.controller');
const { login } = require('../controllers/usuarios.controller');
const { validarCampos } = require('../middlewares/validar-campos');

const router = Router();

router.post('/registro', [
    check('correo_electronico', 'El correo no es válido').isEmail(),
    check('contrasena', 'La contraseña es obligatoria').not().isEmpty(),
    check('rol', 'El rol no es válido').isIn(['C', 'P']) ,  
    validarCampos
], registrarUsuario);

router.post('/login', [
    check('correo_electronico', 'El correo no es válido').isEmail(),
    check('contrasena', 'La contraseña es obligatoria').not().isEmpty(),
    validarCampos
], login);

module.exports = router;