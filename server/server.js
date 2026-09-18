const express = require('express')
const path = require('path');

class Server {
    constructor(){
        this.app = express();
        this.port = process.env.PORT;


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
}

module.exports = Server;