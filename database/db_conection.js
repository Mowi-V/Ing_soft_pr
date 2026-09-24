const { Sequelize } = require('sequelize');


const bdMySQL = new Sequelize(
    'db_bienestar',
    'manager',
    'qCBfL2mu31XJiVRcTKHm',
    {
        host: 'iriguchi.proxy.rlwy.net',
        port: '43944',
        dialect: 'mysql'
    }
);

module.exports = {
    bdMySQL
}
