const Recurso = require('../models/recurso');
const Servicio = require('../models/servicio');
const imagekit = require('../helpers/imagekit');

const subirRecurso = async (req, res) => {
    try {
        const { id: id_servicio } = req.params;
        const usuario = req.usuarioAutenticado || req.usuario;

        if (!usuario) {
            return res.status(401).json({ msg: 'Token no válido o sesión no identificada' });
        }
        const id_usuario = usuario.id_usuario;

        if (!req.file) {
            return res.status(400).json({ msg: 'No se envió ningún archivo' });
        }

        // 1. Validar que el servicio exista y pertenezca al proveedor autenticado
        const servicio = await Servicio.findOne({
            where: {
                id_servicio,
                id_proveedor: id_usuario
            }
        });

        if (!servicio) {
            return res.status(403).json({
                msg: 'No autorizado: el servicio no existe o pertenece a otro proveedor'
            });
        }

        // 2. Determinar tipo de archivo (F o V)
        const esVideo = req.file.mimetype.startsWith('video');
        const tipo = esVideo ? 'V' : 'F';
        const quiereMiniatura = req.body.es_miniatura === 'true';

        // Solo imágenes pueden ser miniatura
        const es_miniatura = (!esVideo && quiereMiniatura) ? 1 : 0;

        // 3. Subir archivo a ImageKit.io
        const uploadResponse = await imagekit.upload({
            file: req.file.buffer,
            fileName: `servicio_${id_servicio}_${Date.now()}`,
            folder: `/servicios/${id_servicio}`
        });

        // 4. Si se marca como miniatura, reiniciar otras miniaturas del mismo servicio
        if (es_miniatura === 1) {
            await Recurso.update(
                { es_miniatura: 0 },
                { where: { id_servicio } }
            );
        }

        // 5. Guardar en base de datos
        const nuevoRecurso = await Recurso.create({
            id_servicio,
            tipo,
            url_archivo: uploadResponse.url,
            es_miniatura,
            file_id: uploadResponse.fileId
        });

        res.status(201).json({
            msg: 'Recurso multimedia subido correctamente',
            recurso: nuevoRecurso
        });

    } catch (error) {
        console.error('Error al subir recurso:', error);
        res.status(500).json({ msg: 'Error interno del servidor al procesar el archivo' });
    }
};

const listarRecursos = async (req, res) => {
    try {
        const { id: id_servicio } = req.params;

        const recursos = await Recurso.findAll({
            where: { id_servicio }
        });

        res.json({ recursos });
    } catch (error) {
        console.error('Error al listar recursos:', error);
        res.status(500).json({ msg: 'Error al consultar recursos' });
    }
};

module.exports = {
    subirRecurso,
    listarRecursos
};