const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');
const Proveedor = require('./proveedor');

const ZonaAtencion = bdMySQL.define('ZonaAtencion', {
    id_zona: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    id_proveedor: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: {
            model: Proveedor,
            key: 'id_proveedor'
        }
    },
    ciudad: { 
        type: DataTypes.STRING(100), 
        allowNull: false 
    },
    barrio_sector: { 
        type: DataTypes.STRING(100), 
        allowNull: false 
    }
}, {
    tableName: 'ZONA_ATENCION',
    timestamps: false
});

Proveedor.hasMany(ZonaAtencion, { foreignKey: 'id_proveedor', onDelete: 'CASCADE' });
ZonaAtencion.belongsTo(Proveedor, { foreignKey: 'id_proveedor' });

module.exports = ZonaAtencion;