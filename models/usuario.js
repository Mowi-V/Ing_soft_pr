const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');

const Usuario = bdMySQL.define('Usuario', {
    id_usuario: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    correo_electronico: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    contrasena_hash: { type: DataTypes.STRING(255), allowNull: false },
    rol: { type: DataTypes.CHAR(1), allowNull: false }, // 'C' Cliente, 'P' Proveedor
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    apellido: { type: DataTypes.STRING(100), allowNull: false }
}, {
    tableName: 'USUARIO',
    timestamps: false
});

module.exports = Usuario;