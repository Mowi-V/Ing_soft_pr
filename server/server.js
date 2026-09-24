const express = require('express')
const path = require('path');
const {bdMySQL} = require('../database/db_conection')


class Server {
    constructor(){
        this.app = express();
        this.port = process.env.PORT;
        this.app.use(express.json());
        this.routes();
        
        this.dbConnection();

        this.app.use(express.static(path.join(__dirname,'..','public')));

        this.app.get(
            '/', (req, res) => {
                res.sendFile(path.join(__dirname,'../public','index.html'))
            } 
        )
        
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
    routes() {
        this.app.use('/api/usuarios', require('../routes/usuarios.route'));
    }
}

module.exports = Server;