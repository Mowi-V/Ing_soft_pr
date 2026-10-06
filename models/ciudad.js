const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');

const Ciudad = bdMySQL.define('Ciudad', {
    id_ciudad: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
    }
}, {
    tableName: 'CIUDAD',
    timestamps: false
});

module.exports = Ciudad;