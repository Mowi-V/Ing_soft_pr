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
 * Convierte un Date (o string SQL/ISO) almacenado en BD a 'YYYY-MM-DD HH:mm' en hora de Colombia (UTC-5).
 */
const formatearFechaHoraDesdeBD = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(valor);

        const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));
        return `${mapa.year}-${mapa.month}-${mapa.day} ${mapa.hour}:${mapa.minute}`;
    }
    const str = String(valor).trim();
    const match = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    return match ? `${match[1]} ${match[2]}` : null;
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

/**
 * HU-015: Aceptación de una solicitud pendiente por el proveedor dentro de una transacción ACID.
 * Adquiere bloqueo pesimista por proveedor y solicitud para impedir dobles reservas concurrentes (RN-11, RN-12).
 */
const aceptarSolicitud = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;
    const { id } = req.params;

    const t = await bdMySQL.transaction();

    try {
        // Serializa mutaciones de agenda para este proveedor durante la transacción ACID
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

        const fechaHoraStr = formatearFechaHoraDesdeBD(solicitud.fecha_hora_solicitada);
        const fechaParseada = parsearFechaHoraSolicitud(fechaHoraStr);

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
            fechaLocal: fechaParseada.fechaLocal,
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

/**
 * HU-016: Rechazo de una solicitud pendiente o sugerida por el proveedor con motivo obligatorio.
 */
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

        if (!['P', 'S'].includes(solicitud.estado)) {
            return res.status(409).json({
                msg: `Solo se pueden rechazar solicitudes en estado Pendiente o Sugerida (estado actual: '${solicitud.estado}')`
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

/**
 * HU-017: Contrapropuesta de nueva fecha y hora por el proveedor.
 * Valida que la solicitud pertenezca al proveedor y esté en estado 'P', que la fecha sugerida
 * sea futura (RN-10), quepa en disponibilidad sin bloqueos ni cruces con reservas 'A' (RN-11).
 */
const contraproponerSolicitud = async (req, res) => {
    const { id_usuario: id_proveedor } = req.usuarioAutenticado;
    const { id } = req.params;
    const { fecha_hora_sugerida } = req.body;

    const fechaParseada = parsearFechaHoraSolicitud(fecha_hora_sugerida);
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
            fechaLocal: fechaParseada.fechaLocal,
            duracionMin: solicitud.duracion_minutos_c,
            excluirSolicitudId: solicitud.id_solicitud,
            transaction: t
        });

        if (!validacionAgenda.ok) {
            await t.rollback();
            return res.status(validacionAgenda.status).json({ msg: validacionAgenda.msg });
        }

        await solicitud.update({
            fecha_hora_sugerida: fechaParseada.fechaHoraBD,
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

/**
 * HU-018: Respuesta del cliente a la contrapropuesta horaria ('S' -> 'A' o 'S' -> 'C').
 * Si acepta, revalida disponibilidad y ausencia de solapamientos dentro de una transacción ACID
 * respetando el orden canónico de bloqueo (PROVEEDOR -> SOLICITUD) y consolida fecha_hora_solicitada.
 */
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
                // Orden canónico global de bloqueo (PROVEEDOR -> SOLICITUD) para evitar deadlocks con HU-015
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
                await solicitud.update({
                    estado: 'C',
                    motivo_rechazo_cancelacion: motivo_rechazo_cancelacion.trim(),
                    fecha_ultima_actualizacion: new Date()
                }, { transaction: t });

                await t.commit();
                return res.json({
                    ok: true,
                    msg: 'Contrapropuesta rechazada y solicitud cancelada',
                    solicitud
                });
            }

            const fechaSugeridaStr = formatearFechaHoraDesdeBD(solicitud.fecha_hora_sugerida);
            const fechaParseada = parsearFechaHoraSolicitud(fechaSugeridaStr);

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
                fechaLocal: fechaParseada.fechaLocal,
                duracionMin: solicitud.duracion_minutos_c,
                excluirSolicitudId: solicitud.id_solicitud,
                transaction: t
            });

            if (!validacionAgenda.ok) {
                await t.rollback();
                return res.status(409).json({ msg: validacionAgenda.msg });
            }

            await solicitud.update({
                fecha_hora_solicitada: fechaParseada.fechaHoraBD,
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

/**
 * HU-019: Cancelación de una solicitud o reserva activa ('P', 'S' o 'A')
 * por parte del cliente o proveedor asociado, exigiendo motivo obligatorio y liberando agenda si estaba en 'A'.
 */
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

        if (solicitud.id_cliente !== id_usuario && solicitud.id_proveedor !== id_usuario) {
            await t.rollback();
            return res.status(403).json({ msg: 'No tienes autorización para cancelar esta solicitud' });
        }

        if (!['P', 'S', 'A'].includes(solicitud.estado)) {
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
    finalizarSolicitud
};