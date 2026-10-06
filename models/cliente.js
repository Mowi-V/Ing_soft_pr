const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');
const Usuario = require('./usuario');
const Ciudad = require('./ciudad');
const Barrio = require('./barrio');

const Cliente = bdMySQL.define('Cliente', {
    id_cliente: { 
        type: DataTypes.INTEGER, 
        primaryKey: true,
        references: {
            model: Usuario,
            key: 'id_usuario'
        }
    },
    id_ciudad: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Ciudad,
            key: 'id_ciudad'
        }
    },
    id_barrio: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Barrio,
            key: 'id_barrio'
        }
    },
    direccion: { 
        type: DataTypes.STRING(255), 
        allowNull: false 
    },
    informacion_complementaria: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'CLIENTE',
    timestamps: false
});


Usuario.hasOne(Cliente, { foreignKey: 'id_cliente', onDelete: 'CASCADE' });
Cliente.belongsTo(Usuario, { foreignKey: 'id_cliente' });

Ciudad.hasMany(Cliente, { foreignKey: 'id_ciudad' });
Cliente.belongsTo(Ciudad, { foreignKey: 'id_ciudad' });

Barrio.hasMany(Cliente, { foreignKey: 'id_barrio' });
Cliente.belongsTo(Barrio, { foreignKey: 'id_barrio' });

module.exports = Cliente;