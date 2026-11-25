require('dotenv').config();
const { Sequelize } = require('sequelize');

// Conexión a MySQL 8.0 usando variables de entorno (evita credenciales hardcodeadas)
const bdMySQL = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        dialect: 'mysql',
        timezone: '-05:00'
    }
);

module.exports = {
    bdMySQL
};
