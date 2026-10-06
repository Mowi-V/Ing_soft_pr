const Ciudad = require('../models/ciudad');
const Barrio = require('../models/barrio');

const obtenerUbicaciones = async (req, res) => {
    try {
        const ciudades = await Ciudad.findAll({
            attributes: ['id_ciudad', 'nombre'],
            include: [{
                model: Barrio,
                attributes: ['id_barrio', 'nombre']
            }]
        });

        res.json({
            msg: 'Ubicaciones obtenidas correctamente',
            ciudades
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error al obtener las ubicaciones' });
    }
};

module.exports = {
    obtenerUbicaciones
};