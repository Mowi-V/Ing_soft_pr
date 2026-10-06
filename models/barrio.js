const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');
const Ciudad = require('./ciudad');

const Barrio = bdMySQL.define('Barrio', {
    id_barrio: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_ciudad: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Ciudad,
            key: 'id_ciudad'
        }
    },
    nombre: {
        type: DataTypes.STRING(100),
        allowNull: false
    }
}, {
    tableName: 'BARRIO',
    timestamps: false
});


Ciudad.hasMany(Barrio, { foreignKey: 'id_ciudad', onDelete: 'CASCADE' });
Barrio.belongsTo(Ciudad, { foreignKey: 'id_ciudad' });

module.exports = Barrio;