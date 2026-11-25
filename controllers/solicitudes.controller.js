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
const {
    obtenerFechaYMDColombia,
    formatearFechaHoraColombia,
    parsearFechaHoraColombia,
    obtenerMaxPendientesSolapadas,
    haySolapamientoIntervalos
} = require('../helpers/fechas-colombia');

const convertirAMinutos = (horaStr) => {
    if (!horaStr) return 0;
    const [h, m] = horaStr.split(':').map(Number);
    return h * 60 + m;
};

const validarDisponibilidadAgenda = async ({
    id_proveedor,
    fechaParte,
    horaParte,
    hora,
    minuto,
    diaCod,
    timestampMs,
    duracionMin,
    excluirSolicitudId = null,
    transaction = null
}) => {
    if (timestampMs <= Date.now()) {
        return { ok: false, status: 400, msg: 'La fecha y hora solicitada debe ser estrictamente futura' };
    }

    const queryOpts = transaction ? { transaction } : {};

    const periodosBloqueados = await PeriodoNoDisponible.findAll({
        where: { id_proveedor },
        ...queryOpts
    });

    const estaBloqueado = periodosBloqueados.some(p => {
        const fIniStr = obtenerFechaYMDColombia(p.fecha_inicio);
        const fFinStr = obtenerFechaYMDColombia(p.fecha_fin);
        return Boolean(fIniStr && fFinStr && fechaParte >= fIniStr && fechaParte <= fFinStr);
    });

    if (estaBloqueado) {
        return {
            ok: false,
            status: 409,
            msg: 'El profesional no se encuentra disponible en la fecha seleccionada (periodo de descanso o bloqueo)'
        };
    }

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

    const nuevaInicioMs = timestampMs;
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

        const fechaParseada = parsearFechaHoraColombia(fecha_hora_solicitada);
        if (!fechaParseada) {
            return res.status(400).json({ msg: 'Formato de fecha inválido. Utilice YYYY-MM-DDTHH:mm o YYYY-MM-DD HH:mm' });
        }

        const { fechaParte, horaParte, hora, minuto, diaCod, timestampMs, fechaUtc } = fechaParseada;
        const id_proveedor = servicio.id_proveedor;
        const duracionMin = servicio.duracion_minutos;
        const maxPendientes = obtenerMaxPendientesSolapadas();

        const t = await bdMySQL.transaction();

        try {
            
            await Proveedor.findByPk(id_proveedor, {
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            const validacionAgenda = await validarDisponibilidadAgenda({
                id_proveedor,
                fechaParte,
                horaParte,
                hora,
                minuto,
                diaCod,
                timestampMs,
                duracionMin,
                transaction: t
            });

            if (!validacionAgenda.ok) {
                await t.rollback();
                return res.status(validacionAgenda.status).json({ msg: validacionAgenda.msg });
            }

            const { nuevaInicioMs, nuevaFinMs } = validacionAgenda;

            
            const pendientesProveedor = await Solicitud.findAll({
                where: {
                    id_proveedor,
                    estado: 'P'
                },
                transaction: t
            });

            const pendientesSolapadas = pendientesProveedor.filter((p) => {
                const pInicioMs = new Date(p.fecha_hora_solicitada).getTime();
                const pDuracion = p.duracion_minutos_c || duracionMin;
                const pFinMs = pInicioMs + (pDuracion * 60 * 1000);
                return haySolapamientoIntervalos(nuevaInicioMs, nuevaFinMs, pInicioMs, pFinMs);
            }).length;

            if (pendientesSolapadas >= maxPendientes) {
                await t.rollback();
                return res.status(409).json({
                    msg: `Este horario ya alcanzó el límite máximo de solicitudes pendientes en revisión (${maxPendientes}). Por favor selecciona otra fecha u hora.`
                });
            }

            
            const solicitudesActivasCliente = await Solicitud.findAll({
                where: {
                    id_cliente,
                    estado: ['P', 'S', 'A']
                },
                transaction: t
            });

            const existeSolicitudEnRango = solicitudesActivasCliente.some((s) => {
                const sBase = s.estado === 'S' && s.fecha_hora_sugerida
                    ? new Date(s.fecha_hora_sugerida)
                    : new Date(s.fecha_hora_solicitada);
                const sInicioMs = sBase.getTime();
                const sDuracion = s.duracion_minutos_c || duracionMin;
                const sFinMs = sInicioMs + (sDuracion * 60 * 1000);

                return haySolapamientoIntervalos(nuevaInicioMs, nuevaFinMs, sInicioMs, sFinMs);
            });

            if (existeSolicitudEnRango) {
                await t.rollback();
                return res.status(409).json({
                    msg: 'Ya tienes otra solicitud o reserva activa que se cruza con este horario. Elige otra franja para evitar traslapes.'
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
                fecha_hora_solicitada: fechaUtc, 
                fecha_hora_sugerida: null,
                direccion_atencion: direccion_atencion.trim(),
                barrio_sector: barrioEncontrado.nombre,
                informacion_complementaria: informacion_complementaria?.trim() || null,
                observaciones: observaciones?.trim() || null,
                estado: 'P',
                motivo_rechazo_cancelacion: null,
                fecha_creacion: ahora,
                fecha_ultima_actualizacion: ahora
            }, { transaction: t });

            await t.commit();

            return res.status(201).json({
                ok: true,
                msg: 'Solicitud creada con éxito bajo estado Pendiente',
                solicitud: nuevaSolicitud
            });
        } catch (errTx) {
            if (!t.finished) {
                await t.rollback();
            }
            throw errTx;
        }

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

const aceptarSolicitud = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;
    const { id } = req.params;

    const t = await bdMySQL.transaction();

    try {
        
        await Proveedor.findByPk(id_proveedor, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        const solicitud = await Solicitud.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!solicitud) {
            await t.rollback();
            return res.status(404).json({ msg: 'Solicitud no encontrada en el sistema' });
        }

        if (solicitud.id_proveedor !== id_proveedor) {
            await t.rollback();
            return res.status(403).json({ msg: 'No tienes autorización para aceptar esta solicitud' });
        }

        if (solicitud.estado !== 'P') {
            await t.rollback();
            return res.status(409).json({
                msg: `Solo se pueden aceptar solicitudes en estado Pendiente (estado actual: '${solicitud.estado}')`
            });
        }

        const fechaHoraStr = formatearFechaHoraColombia(solicitud.fecha_hora_solicitada);
        const fechaParseada = parsearFechaHoraColombia(fechaHoraStr);

        if (!fechaParseada) {
            await t.rollback();
            return res.status(409).json({ msg: 'La fecha solicitada de la orden no es válida para confirmar' });
        }

        const validacionAgenda = await validarDisponibilidadAgenda({
            id_proveedor,
            fechaParte: fechaParseada.fechaParte,
            horaParte: fechaParseada.horaParte,
            hora: fechaParseada.hora,
            minuto: fechaParseada.minuto,
            diaCod: fechaParseada.diaCod,
            timestampMs: fechaParseada.timestampMs,
            duracionMin: solicitud.duracion_minutos_c,
            excluirSolicitudId: solicitud.id_solicitud,
            transaction: t
        });

        if (!validacionAgenda.ok) {
            await t.rollback();
            return res.status(409).json({ msg: validacionAgenda.msg });
        }

        await solicitud.update({
            estado: 'A',
            fecha_ultima_actualizacion: new Date()
        }, { transaction: t });

        await t.commit();

        return res.json({
            ok: true,
            msg: 'Solicitud aceptada y confirmada en tu agenda',
            solicitud
        });
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        console.error('Error al aceptar solicitud:', error);
        return res.status(500).json({ msg: 'Error interno al aceptar la solicitud' });
    }
};


const rechazarSolicitud = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;
    const { id } = req.params;
    const { motivo_rechazo_cancelacion } = req.body;

    try {
        const solicitud = await Solicitud.findByPk(id);

        if (!solicitud) {
            return res.status(404).json({ msg: 'Solicitud no encontrada en el sistema' });
        }

        if (solicitud.id_proveedor !== id_proveedor) {
            return res.status(403).json({ msg: 'No tienes autorización para rechazar esta solicitud' });
        }

        if (solicitud.estado !== 'P') {
            return res.status(409).json({
                msg: `Solo se pueden rechazar solicitudes en estado Pendiente (estado actual: '${solicitud.estado}')`
            });
        }

        await solicitud.update({
            estado: 'R',
            motivo_rechazo_cancelacion: motivo_rechazo_cancelacion.trim(),
            fecha_ultima_actualizacion: new Date()
        });

        return res.json({
            ok: true,
            msg: 'Solicitud rechazada correctamente',
            solicitud
        });
    } catch (error) {
        console.error('Error al rechazar solicitud:', error);
        return res.status(500).json({ msg: 'Error interno al rechazar la solicitud' });
    }
};

const contraproponerSolicitud = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;
    const { id } = req.params;
    const { fecha_hora_sugerida } = req.body;

    const fechaParseada = parsearFechaHoraColombia(fecha_hora_sugerida);
    if (!fechaParseada) {
        return res.status(400).json({
            msg: 'Formato de fecha sugerida inválido. Utilice YYYY-MM-DDTHH:mm o YYYY-MM-DD HH:mm'
        });
    }

    const t = await bdMySQL.transaction();

    try {
        const solicitud = await Solicitud.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!solicitud) {
            await t.rollback();
            return res.status(404).json({ msg: 'Solicitud no encontrada en el sistema' });
        }

        if (solicitud.id_proveedor !== id_proveedor) {
            await t.rollback();
            return res.status(403).json({ msg: 'No tienes autorización para contraproponer esta solicitud' });
        }

        if (solicitud.estado !== 'P') {
            await t.rollback();
            return res.status(409).json({
                msg: `Solo se puede proponer otro horario sobre solicitudes en estado Pendiente (estado actual: '${solicitud.estado}')`
            });
        }

        const validacionAgenda = await validarDisponibilidadAgenda({
            id_proveedor,
            fechaParte: fechaParseada.fechaParte,
            horaParte: fechaParseada.horaParte,
            hora: fechaParseada.hora,
            minuto: fechaParseada.minuto,
            diaCod: fechaParseada.diaCod,
            timestampMs: fechaParseada.timestampMs,
            duracionMin: solicitud.duracion_minutos_c,
            excluirSolicitudId: solicitud.id_solicitud,
            transaction: t
        });

        if (!validacionAgenda.ok) {
            await t.rollback();
            return res.status(validacionAgenda.status).json({ msg: validacionAgenda.msg });
        }

        await solicitud.update({
            fecha_hora_sugerida: fechaParseada.fechaUtc,
            estado: 'S',
            fecha_ultima_actualizacion: new Date()
        }, { transaction: t });

        await t.commit();

        return res.json({
            ok: true,
            msg: 'Contrapropuesta de horario enviada al cliente',
            solicitud
        });
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        console.error('Error al contraproponer horario:', error);
        return res.status(500).json({ msg: 'Error interno al registrar la contrapropuesta' });
    }
};


const responderContrapropuesta = async (req, res) => {
    const { id_usuario: id_cliente } = req.usuarioAutenticado;
    const { id } = req.params;
    const { decision, motivo_rechazo_cancelacion } = req.body;

    try {
        const solicitudPrevia = await Solicitud.findByPk(id);

        if (!solicitudPrevia) {
            return res.status(404).json({ msg: 'Solicitud no encontrada en el sistema' });
        }

        if (solicitudPrevia.id_cliente !== id_cliente) {
            return res.status(403).json({ msg: 'No tienes autorización para responder esta solicitud' });
        }

        const t = await bdMySQL.transaction();

        try {
            if (decision === 'aceptar') {
                
                await Proveedor.findByPk(solicitudPrevia.id_proveedor, {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
            }

            const solicitud = await Solicitud.findByPk(id, {
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!solicitud) {
                await t.rollback();
                return res.status(404).json({ msg: 'Solicitud no encontrada en el sistema' });
            }

            if (solicitud.id_cliente !== id_cliente) {
                await t.rollback();
                return res.status(403).json({ msg: 'No tienes autorización para responder esta solicitud' });
            }

            if (solicitud.estado !== 'S') {
                await t.rollback();
                return res.status(409).json({
                    msg: `Solo se puede responder a una contrapropuesta cuando está en estado Sugerida (estado actual: '${solicitud.estado}')`
                });
            }

            if (decision === 'rechazar') {
                const motivoLimpio = motivo_rechazo_cancelacion ? String(motivo_rechazo_cancelacion).trim() : '';
                await solicitud.update({
                    estado: 'C',
                    motivo_rechazo_cancelacion: motivoLimpio || null,
                    fecha_ultima_actualizacion: new Date()
                }, { transaction: t });

                await t.commit();
                return res.json({
                    ok: true,
                    msg: 'Contrapropuesta rechazada y solicitud cancelada',
                    solicitud
                });
            }

            const fechaSugeridaStr = formatearFechaHoraColombia(solicitud.fecha_hora_sugerida);
            const fechaParseada = parsearFechaHoraColombia(fechaSugeridaStr);

            if (!fechaParseada) {
                await t.rollback();
                return res.status(409).json({
                    msg: 'La fecha sugerida de la contrapropuesta no es válida para confirmar'
                });
            }

            const validacionAgenda = await validarDisponibilidadAgenda({
                id_proveedor: solicitud.id_proveedor,
                fechaParte: fechaParseada.fechaParte,
                horaParte: fechaParseada.horaParte,
                hora: fechaParseada.hora,
                minuto: fechaParseada.minuto,
                diaCod: fechaParseada.diaCod,
                timestampMs: fechaParseada.timestampMs,
                duracionMin: solicitud.duracion_minutos_c,
                excluirSolicitudId: solicitud.id_solicitud,
                transaction: t
            });

            if (!validacionAgenda.ok) {
                await t.rollback();
                return res.status(409).json({ msg: validacionAgenda.msg });
            }

            const reservasConfirmadasCliente = await Solicitud.findAll({
                where: {
                    id_cliente,
                    estado: 'A'
                },
                transaction: t
            });

            const { nuevaInicioMs, nuevaFinMs } = validacionAgenda;
            const clienteAutoColisiona = reservasConfirmadasCliente.some((r) => {
                if (r.id_solicitud === solicitud.id_solicitud) return false;
                const rInicioMs = new Date(r.fecha_hora_solicitada).getTime();
                const rFinMs = rInicioMs + ((r.duracion_minutos_c || solicitud.duracion_minutos_c) * 60 * 1000);
                return haySolapamientoIntervalos(nuevaInicioMs, nuevaFinMs, rInicioMs, rFinMs);
            });

            if (clienteAutoColisiona) {
                await t.rollback();
                return res.status(409).json({
                    msg: 'El horario sugerido se cruza con otra reserva que ya tienes confirmada en tu agenda'
                });
            }

            await solicitud.update({
                fecha_hora_solicitada: fechaParseada.fechaUtc,
                fecha_hora_sugerida: null,
                estado: 'A',
                fecha_ultima_actualizacion: new Date()
            }, { transaction: t });

            await t.commit();

            return res.json({
                ok: true,
                msg: 'Contrapropuesta aceptada y cita confirmada en tu agenda',
                solicitud
            });
        } catch (errTx) {
            if (!t.finished) {
                await t.rollback();
            }
            throw errTx;
        }
    } catch (error) {
        console.error('Error al responder contrapropuesta:', error);
        return res.status(500).json({ msg: 'Error interno al procesar la respuesta a la contrapropuesta' });
    }
};


const cancelarSolicitud = async (req, res) => {
    const { id_usuario } = req.usuarioAutenticado;
    const { id } = req.params;
    const { motivo_rechazo_cancelacion } = req.body;

    const t = await bdMySQL.transaction();

    try {
        const solicitud = await Solicitud.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!solicitud) {
            await t.rollback();
            return res.status(404).json({ msg: 'Solicitud no encontrada en el sistema' });
        }

        const esClientePropietario = solicitud.id_cliente === id_usuario;
        const esProveedorAsignado = solicitud.id_proveedor === id_usuario;

        if (!esClientePropietario && !esProveedorAsignado) {
            await t.rollback();
            return res.status(403).json({ msg: 'No tienes autorización para cancelar esta solicitud' });
        }

        if (esProveedorAsignado && !esClientePropietario) {
            if (solicitud.estado !== 'A') {
                await t.rollback();
                return res.status(409).json({
                    msg: `Como proveedor solo puedes cancelar reservas en estado Aceptada (estado actual: '${solicitud.estado}')`
                });
            }
        } else if (!['P', 'S', 'A'].includes(solicitud.estado)) {
            await t.rollback();
            return res.status(409).json({
                msg: `Solo se pueden cancelar solicitudes en estado Pendiente, Sugerida o Aceptada (estado actual: '${solicitud.estado}')`
            });
        }

        await solicitud.update({
            estado: 'C',
            motivo_rechazo_cancelacion: motivo_rechazo_cancelacion.trim(),
            fecha_ultima_actualizacion: new Date()
        }, { transaction: t });

        await t.commit();

        return res.json({
            ok: true,
            msg: 'Solicitud cancelada correctamente',
            solicitud
        });
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        console.error('Error al cancelar solicitud:', error);
        return res.status(500).json({ msg: 'Error interno al cancelar la solicitud' });
    }
};

/**
 * HU-020: Finalización de un servicio prestado ('A' -> 'F') por parte del proveedor asignado.
 * Utiliza transacción ACID con bloqueo pesimista para evitar condiciones de carrera con cancelaciones (HU-019).
 */
const finalizarSolicitud = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;
    const { id } = req.params;

    const t = await bdMySQL.transaction();

    try {
        const solicitud = await Solicitud.findByPk(id, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!solicitud) {
            await t.rollback();
            return res.status(404).json({ msg: 'Solicitud no encontrada en el sistema' });
        }

        if (solicitud.id_proveedor !== id_proveedor) {
            await t.rollback();
            return res.status(403).json({ msg: 'No tienes autorización para finalizar esta solicitud' });
        }

        if (solicitud.estado !== 'A') {
            await t.rollback();
            return res.status(409).json({
                msg: `Solo se pueden finalizar reservas en estado Aceptada (estado actual: '${solicitud.estado}')`
            });
        }

        await solicitud.update({
            estado: 'F',
            fecha_ultima_actualizacion: new Date()
        }, { transaction: t });

        await t.commit();

        return res.json({
            ok: true,
            msg: 'Servicio marcado como finalizado correctamente',
            solicitud
        });
    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        console.error('Error al finalizar solicitud:', error);
        return res.status(500).json({ msg: 'Error interno al finalizar la solicitud' });
    }
};


const obtenerAgendaProveedor = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;

    try {
        const [reservasConfirmadas, periodosBloqueados] = await Promise.all([
            Solicitud.findAll({
                where: { id_proveedor, estado: 'A' },
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
                order: [['fecha_hora_solicitada', 'ASC']]
            }),
            PeriodoNoDisponible.findAll({
                where: { id_proveedor },
                order: [['fecha_inicio', 'ASC']]
            })
        ]);

        const agenda = reservasConfirmadas.map((r) => {
            const inicioStr = formatearFechaHoraColombia(r.fecha_hora_solicitada) || '';
            const [fecha = '', hora_inicio = ''] = inicioStr.split(' ');

            const inicioMs = new Date(r.fecha_hora_solicitada).getTime();
            const finDate = Number.isNaN(inicioMs)
                ? null
                : new Date(inicioMs + (Number(r.duracion_minutos_c || 0) * 60 * 1000));
            const finStr = finDate ? formatearFechaHoraColombia(finDate) || '' : '';
            const hora_fin = finStr.split(' ')[1] || '';

            return {
                id_solicitud: r.id_solicitud,
                estado: r.estado,
                fecha,
                hora_inicio,
                hora_fin,
                fecha_hora_solicitada: r.fecha_hora_solicitada,
                nombre_servicio_c: r.nombre_servicio_c,
                duracion_minutos_c: r.duracion_minutos_c,
                precio_c: r.precio_c,
                direccion_atencion: r.direccion_atencion,
                barrio_sector: r.barrio_sector,
                comuna: r.barrio?.Comuna?.nombre || null,
                informacion_complementaria: r.informacion_complementaria,
                observaciones: r.observaciones,
                cliente: r.cliente?.Usuario
                    ? {
                        id_usuario: r.cliente.Usuario.id_usuario,
                        nombre: r.cliente.Usuario.nombre,
                        apellido: r.cliente.Usuario.apellido,
                        correo_electronico: r.cliente.Usuario.correo_electronico
                    }
                    : null
            };
        });

        const periodosFormateados = periodosBloqueados.map((p) => ({
            id: p.id,
            id_proveedor: p.id_proveedor,
            fecha_inicio: obtenerFechaYMDColombia(p.fecha_inicio),
            fecha_fin: obtenerFechaYMDColombia(p.fecha_fin)
        }));

        return res.json({
            ok: true,
            total_compromisos: agenda.length,
            agenda,
            periodos_no_disponibles: periodosFormateados
        });
    } catch (error) {
        console.error('Error al consultar agenda operativa del proveedor:', error);
        return res.status(500).json({ msg: 'Error interno al consultar la agenda del proveedor' });
    }
};

module.exports = {
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
};