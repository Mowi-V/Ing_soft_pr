const Usuario = require('../models/usuario');
const Cliente = require('../models/cliente');


const obtenerPerfilCliente = async (req, res) => {

    const { id_usuario } = req.usuarioAutenticado;

    try {
        const usuarioCliente = await Usuario.findOne({
            where: { id_usuario },
            attributes: ['id_usuario', 'correo_electronico', 'nombre', 'apellido', 'rol'],
            include: [{
                model: Cliente,
                attributes: ['direccion']
            }]
        });

        if (!usuarioCliente) {
            return res.status(404).json({ msg: 'No se encontró la información del cliente' });
        }

        res.json({
            msg: 'Perfil del cliente obtenido correctamente',
            perfil: {
                nombre: usuarioCliente.nombre,
                apellido: usuarioCliente.apellido,
                correo_electronico: usuarioCliente.correo_electronico,
                direccion: usuarioCliente.Cliente ? usuarioCliente.Cliente.direccion : null
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error al consultar el perfil' });
    }
};


const actualizarPerfilCliente = async (req, res) => {
    const { id_usuario } = req.usuarioAutenticado;
    const { nombre, apellido, direccion } = req.body;

    try {

        const usuario = await Usuario.findByPk(id_usuario);
        const cliente = await Cliente.findOne({ where: { id_cliente: id_usuario } });

        if (!usuario || !cliente) {
            return res.status(404).json({ msg: 'Perfil de cliente no encontrado' });
        }

        await usuario.update({ nombre, apellido });
        await cliente.update({ direccion });

        res.json({
            msg: 'Perfil actualizado satisfactoriamente',
            perfil_actualizado: {
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                direccion: cliente.direccion
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error al actualizar el perfil' });
    }
};

module.exports = {
    obtenerPerfilCliente,
    actualizarPerfilCliente
};