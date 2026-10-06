const Usuario = require('../models/usuario');
const Proveedor = require('../models/proveedor');
const ZonaAtencion = require('../models/zonaAtencion');

const obtenerPerfilProveedor = async (req, res) => {
    const { id_usuario } = req.usuarioAutenticado;

    try {
        const usuarioProveedor = await Usuario.findOne({
            where: { id_usuario },
            attributes: ['id_usuario', 'correo_electronico', 'nombre', 'apellido', 'rol'],
            include: [{
                model: Proveedor,
                attributes: ['descripcion_perfil'],
                include: [{
                    model: ZonaAtencion,
                    attributes: ['id_zona', 'ciudad', 'barrio_sector']
                }]
            }]
        });

        if (!usuarioProveedor) {
            return res.status(404).json({ msg: 'No se encontró la información del proveedor' });
        }

        res.json({
            msg: 'Perfil del proveedor obtenido correctamente',
            perfil: {
                nombre: usuarioProveedor.nombre,
                apellido: usuarioProveedor.apellido,
                correo_electronico: usuarioProveedor.correo_electronico,
                descripcion_perfil: usuarioProveedor.Proveedor ? usuarioProveedor.Proveedor.descripcion_perfil : null,
                zonas_atencion: usuarioProveedor.Proveedor ? usuarioProveedor.Proveedor.ZonaAtencions : []
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error al consultar el perfil' });
    }
};

const actualizarPerfilProveedor = async (req, res) => {
    const { id_usuario } = req.usuarioAutenticado;
    const { nombre, apellido, descripcion_perfil } = req.body;

    try {
        const usuario = await Usuario.findByPk(id_usuario);
        const proveedor = await Proveedor.findOne({ where: { id_proveedor: id_usuario } });

        if (!usuario || !proveedor) {
            return res.status(404).json({ msg: 'Perfil de proveedor no encontrado' });
        }

        await usuario.update({ nombre, apellido });
        await proveedor.update({ descripcion_perfil });

        res.json({
            msg: 'Perfil actualizado satisfactoriamente',
            perfil_actualizado: { nombre, apellido, descripcion_perfil }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error al actualizar el perfil' });
    }
};


const registrarZonaAtencion = async (req, res) => {
    const { id_usuario } = req.usuarioAutenticado;
    
    // Reemplazamos los textos por los IDs del diccionario
    const { id_ciudad, id_barrio } = req.body;

    try {
        const nuevaZona = await ZonaAtencion.create({
            id_proveedor: id_usuario,
            id_ciudad,
            id_barrio
        });

        res.status(201).json({
            msg: 'Zona de atención registrada correctamente',
            zona: nuevaZona
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error al registrar la zona de atención' });
    }
};

module.exports = {
    obtenerPerfilProveedor,
    actualizarPerfilProveedor,
    registrarZonaAtencion
};