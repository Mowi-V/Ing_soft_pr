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
    contraproponerSolicitud,
    responderContrapropuesta,
    cancelarSolicitud,
    finalizarSolicitud,
    obtenerAgendaProveedor
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

router.patch('/:id/responder-contrapropuesta', [
    validarJWT,
    esCliente,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    check('decision', "La decisión debe ser 'aceptar' o 'rechazar'").isIn(['aceptar', 'rechazar']),
    check('motivo_rechazo_cancelacion')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 255 }).withMessage('El motivo no puede exceder los 255 caracteres'),
    validarCampos
], responderContrapropuesta);

router.patch('/:id/cancelar', [
    validarJWT,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    check('motivo_rechazo_cancelacion', 'El motivo de cancelación es obligatorio').trim().not().isEmpty(),
    check('motivo_rechazo_cancelacion', 'El motivo de cancelación no puede exceder los 255 caracteres').trim().isLength({ max: 255 }),
    validarCampos
], cancelarSolicitud);

router.patch('/:id/finalizar', [
    validarJWT,
    esProveedor,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    validarCampos
], finalizarSolicitud);

router.get('/agenda', [
    validarJWT,
    esProveedor
], obtenerAgendaProveedor);

router.get('/:id', [
    validarJWT,
    esCliente,
    check('id', 'El ID de la solicitud debe ser entero').isInt(),
    validarCampos
], obtenerDetalleSolicitudCliente);

module.exports = router;