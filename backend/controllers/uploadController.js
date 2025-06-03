const path = require('path');
const pool = require('../config/database');
const cloudinary = require('../config/cloudinary');
const fs = require('fs').promises;

const uploadController = {
  // Subir un archivo y asociarlo a una publicación
  uploadFile: async (req, res) => {
    try {
      // Verificar que se haya cargado un archivo
      if (!req.file) {
        return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' });
      }

      const { id_publicacion } = req.params;
      const id_usuario = req.user.id;
      
      // Verificar si la publicación existe y el usuario tiene permisos
      const checkQuery = `
        SELECT p.*, m.id_creador, rm.rol
        FROM publicaciones p
        JOIN murales m ON p.id_mural = m.id_mural
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE p.id_publicacion = ?
      `;
      
      const [publicacion] = await pool.query(checkQuery, [id_usuario, id_publicacion]);
      
      if (!publicacion || publicacion.length === 0) {
        return res.status(404).json({ error: 'Publicación no encontrada' });
      }
      
      const isCreator = publicacion[0].id_creador == id_usuario;
      const isPublicationAuthor = publicacion[0].id_usuario == id_usuario;
      const userRole = publicacion[0].rol || (isCreator ? 'administrador' : null);
      
      if (!isPublicationAuthor && userRole !== 'administrador' && userRole !== 'editor') {
        return res.status(403).json({ error: 'No tienes permisos para modificar esta publicación' });
      }

      // Determinar el tipo de contenido basado en la extensión
      const extension = path.extname(req.file.originalname).toLowerCase();
      let tipo_contenido = 'archivo';
      
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
      const videoExtensions = ['.mp4', '.webm', '.avi', '.mov'];
      const documentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
      
      if (imageExtensions.includes(extension)) {
        tipo_contenido = 'imagen';
      } else if (videoExtensions.includes(extension)) {
        tipo_contenido = 'video';
      }

      // Iniciar transacción
      await pool.query('START TRANSACTION');

      try {
        // Primero eliminar todo el contenido existente
        const [contenidoExistente] = await pool.query(
          'SELECT * FROM contenido WHERE id_publicacion = ?',
          [id_publicacion]
        );

        // Si existe contenido previo, eliminarlo de Cloudinary y la base de datos
        if (contenidoExistente && contenidoExistente.length > 0) {
          for (const contenido of contenidoExistente) {
            if ((contenido.tipo_contenido === 'imagen' || contenido.tipo_contenido === 'video') && 
                contenido.url_contenido) {
              try {
                const urlParts = contenido.url_contenido.split('/');
                const fileName = urlParts[urlParts.length - 1];
                const publicId = `murales/${fileName.split('.')[0]}`;
                await cloudinary.uploader.destroy(publicId);
              } catch (cloudinaryError) {
                console.error('Error al eliminar archivo anterior de Cloudinary:', cloudinaryError);
              }
            }
          }

          // Eliminar todo el contenido de la base de datos
          await pool.query('DELETE FROM contenido WHERE id_publicacion = ?', [id_publicacion]);
        }

        // Verificar que se haya eliminado todo
        const [verificacion] = await pool.query(
          'SELECT COUNT(*) as count FROM contenido WHERE id_publicacion = ?',
          [id_publicacion]
        );

        if (verificacion[0].count > 0) {
          throw new Error('No se pudo eliminar el contenido anterior');
        }
      
        // Subir nuevo archivo a Cloudinary
        const cloudinaryResult = await cloudinary.uploader.upload(req.file.path, {
          resource_type: "auto",
          folder: "murales",
        });

        // Eliminar el archivo temporal
        await fs.unlink(req.file.path);

        // Insertar el nuevo contenido
        const insertQuery = `
          INSERT INTO contenido (id_publicacion, tipo_contenido, url_contenido, nombre_archivo, tamano_archivo)
          VALUES (?, ?, ?, ?, ?)
        `;

        const [result] = await pool.query(insertQuery, [
          id_publicacion,
          tipo_contenido,
          cloudinaryResult.secure_url,
          req.file.originalname,
          req.file.size
        ]);

        // Verificar que solo exista un contenido
        const [verificacionFinal] = await pool.query(
          'SELECT COUNT(*) as count FROM contenido WHERE id_publicacion = ?',
          [id_publicacion]
        );

        if (verificacionFinal[0].count !== 1) {
          throw new Error('Se detectaron múltiples contenidos');
        }

        // Confirmar la transacción
        await pool.query('COMMIT');
      
        res.status(201).json({
          id_contenido: result.insertId,
          id_publicacion,
          tipo_contenido,
          url_contenido: cloudinaryResult.secure_url,
          nombre_archivo: req.file.originalname,
          tamano_archivo: req.file.size,
          mensaje: 'Archivo subido exitosamente'
        });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('Error al subir archivo:', error);
      res.status(500).json({ error: 'Error al subir el archivo: ' + error.message });
    }
  },
  
  // Manejador de errores para multer
  uploadError: (err, req, res, next) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          error: 'El archivo es demasiado grande. El tamaño máximo permitido es 50MB.' 
        });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  }
};

module.exports = uploadController; 