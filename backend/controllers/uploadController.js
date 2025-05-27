const path = require('path');
const db = require('../config/database');
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
      
      // Subir archivo a Cloudinary
      const cloudinaryResult = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "auto",
        folder: "murales",
      });

      // Eliminar el archivo temporal
      await fs.unlink(req.file.path);
      
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
      
      // Verificar si la publicación existe y el usuario tiene permisos
      const checkQuery = `
        SELECT p.*, m.id_creador, rm.rol
        FROM publicaciones p
        JOIN murales m ON p.id_mural = m.id_mural
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE p.id_publicacion = ?
      `;
      
      const [publicacion] = await db.query(checkQuery, [id_usuario, id_publicacion]);
      
      if (!publicacion || publicacion.length === 0) {
        return res.status(404).json({ error: 'Publicación no encontrada' });
      }
      
      const isCreator = publicacion[0].id_creador == id_usuario;
      const isPublicationAuthor = publicacion[0].id_usuario == id_usuario;
      const userRole = publicacion[0].rol || (isCreator ? 'administrador' : null);
      
      // Verificar permisos para agregar contenido
      if (!isPublicationAuthor && userRole !== 'administrador' && userRole !== 'editor') {
        return res.status(403).json({ error: 'No tienes permisos para agregar contenido a esta publicación' });
      }

      // Obtener el contenido anterior
      const [contenidoAnterior] = await db.query(
        'SELECT * FROM contenido WHERE id_publicacion = ?',
        [id_publicacion]
      );

      // Si hay contenido anterior, eliminarlo
      if (contenidoAnterior && contenidoAnterior.length > 0) {
        // Eliminar el archivo de Cloudinary si existe
        for (const contenido of contenidoAnterior) {
          if (contenido.url_contenido) {
            try {
              // Extraer el public_id del URL de Cloudinary
              const publicId = contenido.url_contenido.split('/').slice(-1)[0].split('.')[0];
              await cloudinary.uploader.destroy(publicId);
            } catch (error) {
              console.error('Error al eliminar archivo de Cloudinary:', error);
            }
          }
        }

        // Eliminar registros de la base de datos
        await db.query('DELETE FROM contenido WHERE id_publicacion = ?', [id_publicacion]);
      }
      
      // Insertar el nuevo contenido
      const insertQuery = `
        INSERT INTO contenido (
          id_publicacion, tipo_contenido, url_contenido,
          nombre_archivo, tamano_archivo, fecha_subida
        ) VALUES (?, ?, ?, ?, ?, NOW())
      `;
      
      const [dbResult] = await db.query(insertQuery, [
        id_publicacion,
        tipo_contenido,
        cloudinaryResult.secure_url, // Usar la URL segura de Cloudinary
        req.file.originalname,
        req.file.size
      ]);
      
      res.status(201).json({
        id_contenido: dbResult.insertId,
        id_publicacion,
        tipo_contenido,
        url_contenido: cloudinaryResult.secure_url,
        nombre_archivo: req.file.originalname,
        tamano_archivo: req.file.size,
        mensaje: 'Archivo actualizado exitosamente'
      });
      
    } catch (error) {
      console.error('Error al subir archivo:', error);
      res.status(500).json({ error: 'Error al subir el archivo' });
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