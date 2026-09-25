const bcrypt = require('bcryptjs');
const { bdMySQL } = require('../database/db_conection');
const Usuario = require('../models/usuario');
const Cliente = require('../models/cliente');
const Proveedor = require('../models/proveedor');
const bcrypt = require('bcryptjs');
const { generarJWT } = require('../helpers/generar-jwt');

const registrarUsuario = async (req, res) => {
    const { correo_electronico, contrasena, rol, nombre, apellido, direccion, descripcion_perfil } = req.body;
    
    const t = await bdMySQL.transaction();

    try {
        const salt = bcrypt.genSaltSync(10);
        const contrasena_hash = bcrypt.hashSync(contrasena, salt);

        const usuario = await Usuario.create({
            correo_electronico, contrasena_hash, rol, nombre, apellido
        }, { transaction: t });

        if (rol === 'C') {
            await Cliente.create({ id_cliente: usuario.id_usuario, direccion }, { transaction: t });
        } else if (rol === 'P') {
            await Proveedor.create({ id_proveedor: usuario.id_usuario, descripcion_perfil }, { transaction: t });
        } else {
            throw new Error('Rol inválido');
        }

        await t.commit();
        res.status(201).json({ msg: 'Usuario registrado satisfactoriamente', usuario });

    } catch (error) {
        await t.rollback();
        console.log(error);
        res.status(500).json({ msg: 'Error al registrar el usuario' });
    }
}

const login = async (req, res) => {
    const { correo_electronico, contrasena } = req.body;

    try {

        const usuario = await Usuario.findOne({ where: { correo_electronico } });
        if (!usuario) {
            return res.status(400).json({ msg: 'Credenciales no válidas' });
        }

        const validPassword = bcrypt.compareSync(contrasena, usuario.contrasena_hash);
        if (!validPassword) {
            return res.status(400).json({ msg: 'Credenciales no válidas' });
        }

        const token = await generarJWT(usuario.id_usuario, usuario.rol);

        res.json({
            msg: 'Inicio de sesión exitoso',
            usuario: {
                id_usuario: usuario.id_usuario,
                rol: usuario.rol,
                nombre: usuario.nombre
            },
            token
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: 'Hable con el administrador' });
    }
}
module.exports = {
    registrarUsuario,
    login
};