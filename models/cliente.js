const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');
const Usuario = require('./usuario');

const Cliente = bdMySQL.define('Cliente', {
    id_cliente: { 
        type: DataTypes.INTEGER, 
        primaryKey: true,
        references: {
            model: Usuario,
            key: 'id_usuario'
        }
    },
    direccion: { 
        type: DataTypes.STRING(255), 
        allowNull: false 
    }
}, {
    tableName: 'CLIENTE',
    timestamps: false
});


Usuario.hasOne(Cliente, { foreignKey: 'id_cliente', onDelete: 'CASCADE' });
Cliente.belongsTo(Usuario, { foreignKey: 'id_cliente' });

module.exports = Cliente;