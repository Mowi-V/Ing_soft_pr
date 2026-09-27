const { DataTypes } = require('sequelize');
const { bdMySQL } = require('../database/db_conection');
const Usuario = require('./usuario');

const RecuperacionCredencial = bdMySQL.define('RecuperacionCredencial', {
    id_recuperacion: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    id_usuario: { 
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Usuario,
            key: 'id_usuario'
        }
    },
    token: { 
        type: DataTypes.STRING(255), 
        allowNull: false 
    },
    fecha_creacion: { 
        type: DataTypes.DATE, 
        allowNull: false 
    },
    fecha_expiracion: { 
        type: DataTypes.DATE, 
        allowNull: false 
    },
    usado: { 
        type: DataTypes.TINYINT, 
        allowNull: false, 
        defaultValue: 0 
    }
}, {
    tableName: 'RECUPERACION_CREDENCIALES',
    timestamps: false
});

Usuario.hasMany(RecuperacionCredencial, { foreignKey: 'id_usuario', onDelete: 'CASCADE' });
RecuperacionCredencial.belongsTo(Usuario, { foreignKey: 'id_usuario' });

module.exports = RecuperacionCredencial;