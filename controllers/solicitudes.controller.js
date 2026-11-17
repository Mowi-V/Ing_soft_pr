const { bdMySQL } = require('../database/db_conection');
const Solicitud = require('../models/solicitud');
const Servicio = require('../models/servicio');
const Proveedor = require('../models/proveedor');
const Cliente = require('../models/cliente');
const Usuario = require('../models/usuario');
const Barrio = require('../models/barrio');
const Comuna = require('../models/comuna');
const Disponibilidad = require('../models/disponibilidad');
const PeriodoNoDisponible = require('../models/periodoNoDisponible');

const DIAS_SEMANA = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

const convertirAMinutos = (horaStr) => {
    if (!horaStr) return 0;
    const [h, m] = horaStr.split(':').map(Number);
    return h * 60 + m;
};

/**
 * Convierte un Date o string SQL/ISO a 'YYYY-MM-DD' en zona horaria de Colombia (UTC-5).
 * Evita el error de hacer String(Date).slice(0, 10), que devolvía "Mon Nov 16".
 */
const obtenerFechaYMD = (valor) => {
    if (!valor) return '';
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(valor);
    }
    const str = String(valor).trim();
    const match = str.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
};

/**
 * Parsea una fecha/hora enviada como 'YYYY-MM-DDTHH:mm' o 'YYYY-MM-DD HH:mm'.
 */
const parsearFechaHoraSolicitud = (fechaHoraStr) => {
    if (!fechaHoraStr || typeof fechaHoraStr !== 'string') return null;

    const separador = fechaHoraStr.includes('T') ? 'T' : ' ';
    const [fechaParte, rawHoraParte] = fechaHoraStr.split(separador);
    if (!fechaParte || !rawHoraParte) return null;

    const [anio, mes, diaNum] = fechaParte.split('-').map(Number);
    const horaLimpia = rawHoraParte.replace('Z', '').split(':');
    const hora = parseInt(horaLimpia[0], 10);
    const minuto = parseInt(horaLimpia[1], 10);

    if ([anio, mes, diaNum, hora, minuto].some(Number.isNaN)) {
        return null;
    }

    const horaStr = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
    const fechaHoraBD = `${fechaParte} ${horaStr}:00`;
    const fechaLocal = new Date(anio, mes - 1, diaNum, hora, minuto, 0);

    if (Number.isNaN(fechaLocal.getTime())) return null;

    return { fechaParte, horaParte: horaStr, hora, minuto, fechaHoraBD, fechaLocal };
};

/**
 * Valida reglas RN-10 (fecha futura) y RN-11 (bloqueos, franjas semanales y no solapamiento con citas 'A').
 * Retorna { ok: true, nuevaInicioMs, nuevaFinMs } o { ok: false, status, msg }.
 */
const validarDisponibilidadAgenda = async ({
    id_proveedor,
    fechaParte,
    horaParte,
    hora,
    minuto,
    fechaLocal,
    duracionMin,
    excluirSolicitudId = null,
    transaction = null
}) => {
    if (fechaLocal <= new Date()) {
        return { ok: false, status: 400, msg: 'La fecha y hora solicitada debe ser estrictamente futura' };
    }

    const queryOpts = transaction ? { transaction } : {};

    const periodosBloqueados = await PeriodoNoDisponible.findAll({
        where: { id_proveedor },
        ...queryOpts
    });

    const estaBloqueado = periodosBloqueados.some(p => {
        const fIniStr = obtenerFechaYMD(p.fecha_inicio);
        const fFinStr = obtenerFechaYMD(p.fecha_fin);
        return Boolean(fIniStr && fFinStr && fechaParte >= fIniStr && fechaParte <= fFinStr);
    });

    if (estaBloqueado) {
        return {
            ok: false,
            status: 409,
            msg: 'El profesional no se encuentra disponible en la fecha seleccionada (periodo de descanso o bloqueo)'
        };
    }

    const diaCod = DIAS_SEMANA[fechaLocal.getDay()];
    const franjasDisponibles = await Disponibilidad.findAll({
        where: { id_proveedor, dia: diaCod },
        ...queryOpts
    });

    if (franjasDisponibles.length === 0) {
        return {
            ok: false,
            status: 409,
            msg: `El profesional no atiende los días ${diaCod} según su disponibilidad habitual`
        };
    }

    const minutosInicio = hora * 60 + minuto;
    const minutosFin = minutosInicio + duracionMin;

    const cabeEnJornada = franjasDisponibles.some(f => {
        const fInicio = convertirAMinutos(f.hora_inicio);
        const fFin = convertirAMinutos(f.hora_fin);
        return (minutosInicio >= fInicio && minutosFin <= fFin);
    });

    if (!cabeEnJornada) {
        return {
            ok: false,
            status: 409,
            msg: `El horario solicitado (${horaParte} - duración ${duracionMin} min) excede las franjas de atención del profesional para este día`
        };
    }

    const reservasAceptadas = await Solicitud.findAll({
        where: { id_proveedor, estado: 'A' },
        ...queryOpts
    });

    const nuevaInicioMs = fechaLocal.getTime();
    const nuevaFinMs = nuevaInicioMs + (duracionMin * 60 * 1000);

    const colisiona = reservasAceptadas.some(r => {
        if (excluirSolicitudId && r.id_solicitud === excluirSolicitudId) return false;
        const rBase = r.fecha_hora_sugerida ? new Date(r.fecha_hora_sugerida) : new Date(r.fecha_hora_solicitada);
        const rInicioMs = rBase.getTime();
        const rFinMs = rInicioMs + (r.duracion_minutos_c * 60 * 1000);
        return (nuevaInicioMs < rFinMs && nuevaFinMs > rInicioMs);
    });

    if (colisiona) {
        return {
            ok: false,
            status: 409,
            msg: 'El horario solicitado colisiona con otra reserva previamente confirmada del profesional'
        };
    }

    return { ok: true, nuevaInicioMs, nuevaFinMs };
};

const crearSolicitud = async (req, res) => {
    const { id_usuario: id_cliente } = req.usuarioAutenticado;
    const {
        id_servicio,
        id_barrio,
        fecha_hora_solicitada,
        direccion_atencion,
        informacion_complementaria,
        observaciones
    } = req.body;

    try {
        const servicio = await Servicio.findByPk(id_servicio);
        if (!servicio) {
            return res.status(404).json({ msg: 'El servicio solicitado no existe' });
        }

        if (servicio.estado !== 'A') {
            return res.status(400).json({ msg: 'El servicio no se encuentra activo para nuevas solicitudes' });
        }

        const barrioEncontrado = await Barrio.findByPk(id_barrio, {
            include: [{ model: Comuna, attributes: ['nombre'] }]
        });
        if (!barrioEncontrado) {
            return res.status(400).json({ msg: 'El barrio seleccionado no es válido en el sistema' });
        }

        const fechaParseada = parsearFechaHoraSolicitud(fecha_hora_solicitada);
        if (!fechaParseada) {
            return res.status(400).json({ msg: 'Formato de fecha inválido. Utilice YYYY-MM-DDTHH:mm o YYYY-MM-DD HH:mm' });
        }

        const { fechaParte, horaParte, hora, minuto, fechaHoraBD, fechaLocal } = fechaParseada;
        const id_proveedor = servicio.id_proveedor;
        const duracionMin = servicio.duracion_minutos;

        const validacionAgenda = await validarDisponibilidadAgenda({
            id_proveedor,
            fechaParte,
            horaParte,
            hora,
            minuto,
            fechaLocal,
            duracionMin
        });

        if (!validacionAgenda.ok) {
            return res.status(validacionAgenda.status).json({ msg: validacionAgenda.msg });
        }

        const { nuevaInicioMs, nuevaFinMs } = validacionAgenda;

        const solicitudesActivasCliente = await Solicitud.findAll({
            where: {
                id_cliente,
                id_servicio: servicio.id_servicio,
                estado: ['P', 'S'] // Pendientes o con contrapropuesta activa
            }
        });

        const existeSolicitudEnRango = solicitudesActivasCliente.some(s => {
            const sBase = s.fecha_hora_sugerida
                ? new Date(s.fecha_hora_sugerida)
                : new Date(s.fecha_hora_solicitada);
            const sInicioMs = sBase.getTime();
            const sDuracion = s.duracion_minutos_c || duracionMin;
            const sFinMs = sInicioMs + (sDuracion * 60 * 1000);

            return (nuevaInicioMs < sFinMs && nuevaFinMs > sInicioMs);
        });

        if (existeSolicitudEnRango) {
            return res.status(409).json({
                msg: 'Ya tienes una solicitud activa para este servicio cuyo horario se cruza con el rango solicitado'
            });
        }

        const ahora = new Date();
        const nuevaSolicitud = await Solicitud.create({
            id_cliente,
            id_proveedor,
            id_servicio: servicio.id_servicio,
            id_barrio: parseInt(id_barrio, 10),
            nombre_servicio_c: servicio.nombre,
            precio_c: servicio.precio,
            duracion_minutos_c: servicio.duracion_minutos,
            fecha_hora_solicitada: fechaHoraBD, // Cadena literal para evitar alteraciones UTC
            fecha_hora_sugerida: null,
            direccion_atencion: direccion_atencion.trim(),
            barrio_sector: barrioEncontrado.nombre,
            informacion_complementaria: informacion_complementaria?.trim() || null,
            observaciones: observaciones?.trim() || null,
            estado: 'P',
            motivo_rechazo_cancelacion: null,
            fecha_creacion: ahora,
            fecha_ultima_actualizacion: ahora
        });

        res.status(201).json({
            ok: true,
            msg: 'Solicitud creada con éxito bajo estado Pendiente',
            solicitud: nuevaSolicitud
        });

    } catch (error) {
        console.error('Error al registrar solicitud:', error);
        res.status(500).json({ msg: 'Error interno al registrar la solicitud' });
    }
};

const obtenerMisSolicitudes = async (req, res) => {
    const { id_usuario: id_cliente } = req.usuarioAutenticado;
    const { estado } = req.query;

    try {
        const whereClause = { id_cliente };
        if (estado && estado !== 'TODOS') {
            whereClause.estado = estado;
        }

        const solicitudes = await Solicitud.findAll({
            where: whereClause,
            include: [
                {
                    model: Proveedor,
                    as: 'proveedor',
                    include: [
                        {
                            model: Usuario,
                            attributes: ['id_usuario', 'nombre', 'apellido', 'correo_electronico']
                        }
                    ]
                },
                {
                    model: Barrio,
                    as: 'barrio',
                    attributes: ['id_barrio', 'nombre'],
                    include: [
                        { model: Comuna, attributes: ['id_comuna', 'nombre'] }
                    ]
                }
            ],
            order: [['fecha_creacion', 'DESC']]
        });

        res.json({
            ok: true,
            total: solicitudes.length,
            solicitudes
        });
    } catch (error) {
        console.error('Error al consultar solicitudes del cliente:', error);
        res.status(500).json({ msg: 'Error al consultar tus solicitudes' });
    }
};

const obtenerDetalleSolicitudCliente = async (req, res) => {
    const { id_usuario: id_cliente } = req.usuarioAutenticado;
    const { id } = req.params;

    try {
        const solicitud = await Solicitud.findByPk(id, {
            include: [
                {
                    model: Proveedor,
                    as: 'proveedor',
                    include: [
                        {
                            model: Usuario,
                            attributes: ['id_usuario', 'nombre', 'apellido', 'correo_electronico']
                        }
                    ]
                },
                {
                    model: Barrio,
                    as: 'barrio',
                    attributes: ['id_barrio', 'nombre'],
                    include: [
                        { model: Comuna, attributes: ['id_comuna', 'nombre'] }
                    ]
                }
            ]
        });

        if (!solicitud) {
            return res.status(404).json({ msg: 'Solicitud no encontrada' });
        }

        if (solicitud.id_cliente !== id_cliente) {
            return res.status(403).json({ msg: 'No tienes autorización para consultar esta solicitud' });
        }

        res.json({
            ok: true,
            solicitud
        });
    } catch (error) {
        console.error('Error al consultar detalle de solicitud:', error);
        res.status(500).json({ msg: 'Error interno al consultar la solicitud' });
    }
};

const obtenerSolicitudesProveedor = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;
    const { estado } = req.query;

    try {
        const whereClause = { id_proveedor };
        if (estado && estado !== 'TODOS') {
            whereClause.estado = estado;
        }

        const solicitudes = await Solicitud.findAll({
            where: whereClause,
            include: [
                {
                    model: Cliente,
                    as: 'cliente',
                    include: [
                        {
                            model: Usuario,
                            attributes: ['id_usuario', 'nombre', 'apellido', 'correo_electronico']
                        }
                    ]
                },
                {
                    model: Barrio,
                    as: 'barrio',
                    attributes: ['id_barrio', 'nombre'],
                    include: [
                        { model: Comuna, attributes: ['id_comuna', 'nombre'] }
                    ]
                }
            ],
            order: [
                [Solicitud.sequelize.literal("CASE WHEN estado = 'P' THEN 1 WHEN estado = 'S' THEN 2 WHEN estado = 'A' THEN 3 ELSE 4 END"), 'ASC'],
                ['fecha_hora_solicitada', 'ASC']
            ]
        });

        res.json({
            ok: true,
            total: solicitudes.length,
            solicitudes
        });
    } catch (error) {
        console.error('Error al consultar solicitudes del proveedor:', error);
        res.status(500).json({ msg: 'Error al consultar las solicitudes recibidas' });
    }
};

const obtenerDetalleSolicitudProveedor = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;
    const { id } = req.params;

    try {
        const solicitud = await Solicitud.findByPk(id, {
            include: [
                {
                    model: Cliente,
                    as: 'cliente',
                    include: [
                        {
                            model: Usuario,
                            attributes: ['id_usuario', 'nombre', 'apellido', 'correo_electronico']
                        }
                    ]
                },
                {
                    model: Barrio,
                    as: 'barrio',
                    attributes: ['id_barrio', 'nombre'],
                    include: [
                        { model: Comuna, attributes: ['id_comuna', 'nombre'] }
                    ]
                }
            ]
        });

        if (!solicitud) {
            return res.status(404).json({ msg: 'Solicitud no encontrada en el sistema' });
        }

        if (solicitud.id_proveedor !== id_proveedor) {
            return res.status(403).json({ msg: 'No tienes autorización para consultar esta solicitud' });
        }

        res.json({
            ok: true,
            solicitud
        });
    } catch (error) {
        console.error('Error al consultar detalle para proveedor:', error);
        res.status(500).json({ msg: 'Error interno al consultar la solicitud' });
    }
};

module.exports = {
    crearSolicitud,
    obtenerMisSolicitudes,
    obtenerDetalleSolicitudCliente,
    obtenerSolicitudesProveedor,
    obtenerDetalleSolicitudProveedor
};