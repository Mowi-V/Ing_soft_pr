const ZONA_HORARIA_CO = 'America/Bogota';
const OFFSET_CO = '-05:00';
const DIAS_SEMANA = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

const esFechaCalendarioValida = (anio, mes, dia) => {
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
    const d = new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0));
    return (
        d.getUTCFullYear() === anio &&
        d.getUTCMonth() === mes - 1 &&
        d.getUTCDate() === dia
    );
};

/**
 * Obtiene la fecha 'YYYY-MM-DD' en hora oficial de Colombia (America/Bogota, UTC-5).
 * Si recibe un string que ya es solo fecha ('YYYY-MM-DD'), lo conserva sin pasarlo por UTC.
 */
const obtenerFechaYMDColombia = (valor) => {
    if (!valor) return '';
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: ZONA_HORARIA_CO,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(valor);
    }

    const str = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }

    // Si es un string ISO con zona/hora (ej. '2027-06-14T05:00:00.000Z'), convertir en America/Bogota
    if (/^\d{4}-\d{2}-\d{2}T/.test(str) && (str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str))) {
        const d = new Date(str);
        if (!Number.isNaN(d.getTime())) {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: ZONA_HORARIA_CO,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(d);
        }
    }

    const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
};

/**
 * Convierte un Date (o string SQL/ISO) almacenado en BD a 'YYYY-MM-DD HH:mm' en hora de Colombia (UTC-5).
 */
const formatearFechaHoraColombia = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone: ZONA_HORARIA_CO,
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
    if (/^\d{4}-\d{2}-\d{2}T/.test(str) && (str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str))) {
        const d = new Date(str);
        if (!Number.isNaN(d.getTime())) {
            return formatearFechaHoraColombia(d);
        }
    }

    const match = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    return match ? `${match[1]} ${match[2]}` : null;
};

/**
 * Parsea una fecha/hora de cita enviada como 'YYYY-MM-DDTHH:mm' o 'YYYY-MM-DD HH:mm'
 * asumiendo siempre hora oficial de Colombia (America/Bogota, UTC-5),
 * completamente independiente de la zona horaria del proceso de Node (TZ).
 */
const parsearFechaHoraColombia = (fechaHoraStr) => {
    if (!fechaHoraStr || typeof fechaHoraStr !== 'string') return null;

    const limpio = fechaHoraStr.trim();
    const match = limpio.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;

    const anio = Number(match[1]);
    const mes = Number(match[2]);
    const diaNum = Number(match[3]);
    const hora = Number(match[4]);
    const minuto = Number(match[5]);

    if (!esFechaCalendarioValida(anio, mes, diaNum)) return null;
    if (!Number.isInteger(hora) || hora < 0 || hora > 23) return null;
    if (!Number.isInteger(minuto) || minuto < 0 || minuto > 59) return null;

    const fechaParte = `${match[1]}-${match[2]}-${match[3]}`;
    const horaParte = `${match[4]}:${match[5]}`;
    const fechaHoraBD = `${fechaParte} ${horaParte}:00`;
    const fechaUtc = new Date(`${fechaParte}T${horaParte}:00${OFFSET_CO}`);

    if (Number.isNaN(fechaUtc.getTime())) return null;

    // Día de la semana calculado sobre el mediodía UTC de la fecha calendario -> inmune a TZ del servidor
    const diaCod = DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, diaNum, 12, 0, 0)).getUTCDay()];

    return {
        fechaParte,
        horaParte,
        hora,
        minuto,
        diaCod,
        fechaHoraBD,
        fechaUtc,
        timestampMs: fechaUtc.getTime()
    };
};

/**
 * Parsea una fecha de solo día ('YYYY-MM-DD' o prefijo ISO) en calendario de Colombia (UTC-5)
 * para periodos no disponibles, generando límites exactos 00:00:00-05:00 y 23:59:59-05:00.
 */
const parsearFechaSoloDiaColombia = (valor) => {
    if (!valor || typeof valor !== 'string') return null;

    const match = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;

    const anio = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);

    if (!esFechaCalendarioValida(anio, mes, dia)) return null;

    const ymd = `${match[1]}-${match[2]}-${match[3]}`;
    const inicioDiaUtc = new Date(`${ymd}T00:00:00${OFFSET_CO}`);
    const finDiaUtc = new Date(`${ymd}T23:59:59${OFFSET_CO}`);

    if (Number.isNaN(inicioDiaUtc.getTime()) || Number.isNaN(finDiaUtc.getTime())) {
        return null;
    }

    return {
        ymd,
        inicioDiaUtc,
        finDiaUtc
    };
};

/**
 * Devuelve el inicio del día actual (00:00:00-05:00) en hora oficial de Colombia.
 */
const obtenerInicioHoyColombiaUtc = () => {
    const hoyYmd = obtenerFechaYMDColombia(new Date());
    return new Date(`${hoyYmd}T00:00:00${OFFSET_CO}`);
};

/**
 * Retorna el límite máximo configurado de solicitudes pendientes ('P') solapadas
 * permitidas en una misma franja horaria de un proveedor (por defecto 3).
 */
const obtenerMaxPendientesSolapadas = () => {
    const parsed = parseInt(process.env.MAX_PENDIENTES_SOLAPADAS || '3', 10);
    return Number.isInteger(parsed) && parsed >= 1 ? parsed : 3;
};

/**
 * Determina si dos intervalos semiabiertos [inicioA, finA) y [inicioB, finB) se solapan.
 */
const haySolapamientoIntervalos = (inicioA, finA, inicioB, finB) => {
    return inicioA < finB && finA > inicioB;
};

module.exports = {
    ZONA_HORARIA_CO,
    OFFSET_CO,
    DIAS_SEMANA,
    obtenerFechaYMDColombia,
    formatearFechaHoraColombia,
    parsearFechaHoraColombia,
    parsearFechaSoloDiaColombia,
    obtenerInicioHoyColombiaUtc,
    obtenerMaxPendientesSolapadas,
    haySolapamientoIntervalos
};
