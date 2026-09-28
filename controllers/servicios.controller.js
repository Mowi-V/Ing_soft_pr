const Servicio = require('../models/servicio');

const crearServicio = async (req, res) => {
    const { id_usuario } = req.usuarioAutenticado;
    
    const { 
        nombre, 
        categoria, 
        descripcion, 
        duracion_minutos, 
        precio,
        estado = 'A'
    } = req.body;

    try {
        const nuevoServicio = await Servicio.create({
            id_proveedor: id_usuario,
            nombre,
            categoria,
            descripcion,
            duracion_minutos,
            precio,
            estado
        });

        res.status(201).json({
            msg: 'Servicio registrado correctamente en el catálogo',
            servicio: nuevoServicio
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error al registrar el servicio' });
    }
};

module.exports = {
    crearServicio
};