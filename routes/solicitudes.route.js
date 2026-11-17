const { Router } = require('express');
const { check } = require('express-validator');
const { 
    crearSolicitud, 
    obtenerMisSolicitudes, 
    obtenerDetalleSolicitudCliente,
    obtenerSolicitudesProveedor,
    obtenerDetalleSolicitudProveedor,
    aceptarSolicitud,
    rechazarSolicitud,
    contraproponerSolicitud
} = require('../controllers/solicitudes.controller');
const { validarJWT, esCliente, esProveedor } = require('../middlewares/validar-jwt');
const { validarCampos } = require('../middlewares/validar-campos');

const router = Router();

router.get('/mias', [
    validarJWT,
    esCliente
], obtenerMisSolicitudes);


router.get('/recibidas', [
    validarJWT,
    esProveedor
], obtenerSolicitudesProveedor);

router.get('/recibidas/:id', [
    validarJWT,
    esProveedor,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    validarCampos
], obtenerDetalleSolicitudProveedor);

router.post('/', [
    validarJWT,
    esCliente,
    check('id_servicio', 'El ID del servicio es obligatorio y debe ser un número entero').isInt(),
    check('id_barrio', 'El ID del barrio es obligatorio y debe ser un número entero').isInt(),
    check('fecha_hora_solicitada', 'La fecha y hora solicitada es obligatoria (YYYY-MM-DDTHH:mm)')
        .matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/),
    check('direccion_atencion', 'La dirección del domicilio es obligatoria').trim().not().isEmpty(),
    validarCampos
], crearSolicitud);

router.patch('/:id/aceptar', [
    validarJWT,
    esProveedor,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    validarCampos
], aceptarSolicitud);

router.patch('/:id/rechazar', [
    validarJWT,
    esProveedor,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    check('motivo_rechazo_cancelacion', 'El motivo del rechazo es obligatorio').trim().not().isEmpty(),
    check('motivo_rechazo_cancelacion', 'El motivo del rechazo no puede exceder los 255 caracteres').trim().isLength({ max: 255 }),
    validarCampos
], rechazarSolicitud);

router.patch('/:id/contraproponer', [
    validarJWT,
    esProveedor,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    check('fecha_hora_sugerida', 'La nueva fecha y hora sugerida es obligatoria (YYYY-MM-DDTHH:mm)')
        .matches(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/),
    validarCampos
], contraproponerSolicitud);

router.get('/:id', [
    validarJWT,
    esCliente,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    validarCampos
], obtenerDetalleSolicitudCliente);

module.exports = router;