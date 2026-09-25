const jwt = require('jsonwebtoken');

const generarJWT = (id_usuario, rol) => {
    return new Promise((resolve, reject) => {

        const payload = { id_usuario, rol };

        jwt.sign(payload, process.env.SECRETORPRIVATEKEY, {
            expiresIn: '4h'
        }, (err, token) => {
            if (err) {
                console.log(err);
                reject('No se pudo generar el token');
            } else {    
                resolve(token);
            }
        });
    });
};

module.exports = {
    generarJWT
};