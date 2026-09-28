const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');
const Proveedor = require('./proveedor');

const Servicio = bdMySQL.define('Servicio', {
    id_servicio: { 
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
    nombre: { 
        type: DataTypes.STRING(100), 
        allowNull: false 
    },
    categoria: { 
        type: DataTypes.STRING(100), 
        allowNull: false 
    },
    descripcion: { 
        type: DataTypes.TEXT, 
        allowNull: false 
    },
    duracion_minutos: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    precio: { 
        type: DataTypes.DECIMAL(10, 2), 
        allowNull: false 
    },
    estado: { 
        type: DataTypes.CHAR(1), 
        allowNull: false,
        defaultValue: 'A' // 'A' para Activo, 'I' para Inactivo
    }
}, {
    tableName: 'SERVICIO',
    timestamps: false
});

Proveedor.hasMany(Servicio, { foreignKey: 'id_proveedor', onDelete: 'CASCADE' });
Servicio.belongsTo(Proveedor, { foreignKey: 'id_proveedor' });

module.exports = Servicio;