const bcrypt = require('bcryptjs');
const { bdMySQL } = require('../database/db_conection');
const Usuario = require('../models/usuario');
const Cliente = require('../models/cliente');
const Proveedor = require('../models/proveedor');

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