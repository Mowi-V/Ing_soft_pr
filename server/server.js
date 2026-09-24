const express = require('express')
const path = require('path');
const {bdMySQL} = require('../database/db_conection')


class Server {
    constructor(){
        this.app = express();
        this.port = process.env.PORT;


        this.app.get(
            '/', (req, res) => {
                res.sendFile(path.join(__dirname,'../public','index.html'))
            } 
        )
        this.dbConnection();
    }


    listen() {
        this.app.listen(this.port, () => {
            console.log('Servidor corriendo en puerto', this.port);
        });
    }

    async dbConnection() {
        try {
            await bdMySQL.authenticate();
            console.log('Connection OK a Nube.');
        } catch (error) {
            console.error('No se pudo Conectar a la BD MySQL', error);
        }
    }
}

module.exports = Server;