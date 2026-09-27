const { Router } = require('express');
const { check } = require('express-validator');
const { solicitarRecuperacion, restablecerContrasena } = require('../controllers/recuperacion.controller');
const { validarCampos } = require('../middlewares/validar-campos');

const router = Router();

router.post('/solicitar', [
    check('correo_electronico', 'El correo es obligatorio y debe tener formato válido').isEmail(),
    validarCampos
], solicitarRecuperacion);


router.post('/restablecer', [
    check('token', 'El token es obligatorio').not().isEmpty(),
    check('nueva_contrasena', 'La nueva contraseña es obligatoria').not().isEmpty(),
    check('nueva_contrasena', 'La contraseña debe tener más de 6 letras').isLength({ min: 6 }),
    validarCampos
], restablecerContrasena);

module.exports = router;