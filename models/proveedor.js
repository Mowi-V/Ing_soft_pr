const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');
const Usuario = require('./usuario');

const Proveedor = bdMySQL.define('Proveedor', {
    id_proveedor: { 
        type: DataTypes.INTEGER, 
        primaryKey: true,
        references: {
            model: Usuario,
            key: 'id_usuario'
        }
    },
    descripcion_perfil: { 
        type: DataTypes.TEXT, 
        allowNull: false 
    }
}, {
    tableName: 'PROVEEDOR',
    timestamps: false
});


Usuario.hasOne(Proveedor, { foreignKey: 'id_proveedor', onDelete: 'CASCADE' });
Proveedor.belongsTo(Usuario, { foreignKey: 'id_proveedor' });

module.exports = Proveedor;