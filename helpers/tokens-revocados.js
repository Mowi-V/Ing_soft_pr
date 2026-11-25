const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const TTL_DEFECTO_MS = 4 * 60 * 60 * 1000; // 4 horas (misma vigencia que generarJWT)
const tokensRevocados = new Map();

const obtenerHashToken = (token) => {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
};

const limpiarExpirados = (ahoraMs = Date.now()) => {
    for (const [clave, expMs] of tokensRevocados.entries()) {
        if (expMs <= ahoraMs) {
            tokensRevocados.delete(clave);
        }
    }
};

/**
 * Registra un JWT como revocado hasta su expiración natural (exp).
 * Soporta tokens con `jti` y tokens legados mediante su hash SHA-256.
 */
const revocarToken = (token) => {
    if (!token || typeof token !== 'string') return false;

    const ahoraMs = Date.now();
    limpiarExpirados(ahoraMs);

    const decoded = jwt.decode(token);
    const expMs = decoded && typeof decoded === 'object' && typeof decoded.exp === 'number'
        ? decoded.exp * 1000
        : ahoraMs + TTL_DEFECTO_MS;

    if (expMs <= ahoraMs) {
        return false;
    }

    if (decoded && typeof decoded === 'object' && decoded.jti) {
        tokensRevocados.set(`jti:${decoded.jti}`, expMs);
    }
    tokensRevocados.set(`sha:${obtenerHashToken(token)}`, expMs);
    return true;
};

/**
 * Verifica si un JWT fue revocado explícitamente al cerrar sesión.
 */
const estaTokenRevocado = (token, payload = null) => {
    if (!token || typeof token !== 'string') return false;

    const ahoraMs = Date.now();
    limpiarExpirados(ahoraMs);

    if (payload && payload.jti) {
        const expJti = tokensRevocados.get(`jti:${payload.jti}`);
        if (expJti && expJti > ahoraMs) return true;
    }

    const expHash = tokensRevocados.get(`sha:${obtenerHashToken(token)}`);
    return Boolean(expHash && expHash > ahoraMs);
};

module.exports = {
    revocarToken,
    estaTokenRevocado,
    limpiarExpirados
};
