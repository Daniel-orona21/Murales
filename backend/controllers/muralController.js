const db = require('../config/database');
const { pool } = require('../config/db');
const { verificarToken } = require('../middleware/auth');

const muralController = {
  getMuralesByUsuario: async (req, res) => {
    try {
      const userId = req.user.id;

      if (!userId) {
        return res.status(400).json({ error: 'ID de usuario no encontrado en el token' });
      }

      const query = `
        SELECT m.*, 
               CASE 
                 WHEN m.id_creador = ? THEN 'administrador'
                 ELSE COALESCE(rm.rol, 'lector') 
               END as rol_usuario
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE m.id_creador = ? OR rm.id_usuario = ?
        GROUP BY m.id_mural
        ORDER BY m.fecha_creacion DESC
      `;

      const [murales] = await db.query(query, [userId, userId, userId, userId]);
      
      if (!murales) {
        return res.status(404).json({ error: 'No se encontraron murales para este usuario' });
      }

      res.json(murales);
    } catch (error) {
      console.error('Error al obtener murales:', error);
      res.status(500).json({ error: 'Error al obtener los murales' });
    }
  },

  getMuralById: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const query = `
        SELECT m.* 
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural
        WHERE m.id_mural = ? AND (m.id_creador = ? OR rm.id_usuario = ?)
      `;

      const [mural] = await db.query(query, [id, userId, userId]);

      if (!mural || mural.length === 0) {
        return res.status(404).json({ error: 'Mural no encontrado' });
      }

      res.json(mural[0]);
    } catch (error) {
      console.error('Error al obtener mural:', error);
      res.status(500).json({ error: 'Error al obtener el mural' });
    }
  },

  createMural: async (req, res) => {
    try {
      const { titulo, descripcion, privacidad } = req.body;
      const userId = req.user.id;

      if (!userId) {
        return res.status(400).json({ error: 'ID de usuario no encontrado en el token' });
      }

      if (!titulo || !descripcion || !privacidad) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }

      // Generate unique 4-digit code
      let codigoAcceso;
      let codeExists = true;
      while (codeExists) {
        codigoAcceso = Math.floor(1000 + Math.random() * 9000).toString(); // Generates 1000-9999
        const [existingCode] = await db.query(
          'SELECT id_mural FROM murales WHERE codigo_acceso = ?',
          [codigoAcceso]
        );
        if (!existingCode || existingCode.length === 0) {
          codeExists = false;
        }
      }

      const query = `
        INSERT INTO murales (titulo, descripcion, id_creador, privacidad, codigo_acceso, fecha_creacion, fecha_actualizacion, estado)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 1)
      `;

      const [result] = await db.query(query, [titulo, descripcion, userId, privacidad, codigoAcceso]);

      // Crear el rol de administrador para el creador
      const rolQuery = `
        INSERT INTO roles_mural (id_usuario, id_mural, rol, fecha_asignacion)
        VALUES (?, ?, 'administrador', NOW())
      `;

      await db.query(rolQuery, [userId, result.insertId]);

      res.status(201).json({
        id_mural: result.insertId,
        titulo,
        descripcion,
        privacidad,
        codigo_acceso: codigoAcceso,
        mensaje: 'Mural creado exitosamente'
      });
    } catch (error) {
      console.error('Error al crear mural:', error);
      res.status(500).json({ error: 'Error al crear el mural' });
    }
  },

  updateMural: async (req, res) => {
    try {
      const { id } = req.params;
      const { titulo, descripcion, privacidad } = req.body;
      const userId = req.user.id;

      // Verificar si el usuario tiene permisos para editar
      const checkQuery = `
        SELECT m.* FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural
        WHERE m.id_mural = ? AND (m.id_creador = ? OR (rm.id_usuario = ? AND rm.rol IN ('administrador', 'editor')))
      `;

      const [mural] = await db.query(checkQuery, [id, userId, userId]);

      if (!mural || mural.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para editar este mural' });
      }

      const updateQuery = `
        UPDATE murales 
        SET titulo = ?, descripcion = ?, privacidad = ?, fecha_actualizacion = NOW()
        WHERE id_mural = ?
      `;

      await db.query(updateQuery, [titulo, descripcion, privacidad, id]);

      res.json({ 
        mensaje: 'Mural actualizado exitosamente',
        id_mural: id,
        titulo,
        descripcion,
        privacidad
      });
    } catch (error) {
      console.error('Error al actualizar mural:', error);
      res.status(500).json({ error: 'Error al actualizar el mural' });
    }
  },

  deleteMural: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verificar si el usuario tiene permisos para eliminar
      const checkQuery = `
        SELECT m.* FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural
        WHERE m.id_mural = ? AND (m.id_creador = ? OR (rm.id_usuario = ? AND rm.rol = 'administrador'))
      `;

      const [mural] = await db.query(checkQuery, [id, userId, userId]);

      if (!mural || mural.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para eliminar este mural' });
      }

      // Eliminar roles asociados
      await db.query('DELETE FROM roles_mural WHERE id_mural = ?', [id]);
      
      // Eliminar mural
      await db.query('DELETE FROM murales WHERE id_mural = ?', [id]);

      res.json({ mensaje: 'Mural eliminado exitosamente' });
    } catch (error) {
      console.error('Error al eliminar mural:', error);
      res.status(500).json({ error: 'Error al eliminar el mural' });
    }
  },

  joinMuralWithCode: async (req, res) => {
    try {
      const { codigo } = req.body;
      const userId = req.user.id;

      console.log('Solicitud recibida:', { codigo, userId });

      if (!codigo) {
        return res.status(400).json({ error: 'El código de acceso es requerido' });
      }

      // Verificar si el mural existe
      const [mural] = await db.query(
        'SELECT id_mural, titulo, id_creador FROM murales WHERE codigo_acceso = ?',
        [codigo]
      );

      console.log('Resultado de búsqueda del mural:', mural);

      if (!mural || mural.length === 0) {
        return res.status(404).json({ error: 'Mural no encontrado. El código de acceso no es válido.' });
      }

      const muralId = mural[0].id_mural;
      const muralTitle = mural[0].titulo;
      const creatorId = mural[0].id_creador;

      // Verificar si el usuario ya está asociado al mural
      const [existingRole] = await db.query(
        'SELECT id_rol FROM roles_mural WHERE id_usuario = ? AND id_mural = ?',
        [userId, muralId]
      );

      console.log('Rol existente:', existingRole);

      if (existingRole && existingRole.length > 0) {
        return res.status(409).json({ error: 'Ya te encuentras asociado a este mural' });
      }

      // Verificar si ya existe una solicitud pendiente
      const [existingRequest] = await db.query(
        `SELECT id_notificacion FROM notificaciones 
         WHERE id_emisor = ? AND id_mural = ? AND tipo = 'solicitud_acceso' AND estado_solicitud = 'pendiente'`,
        [userId, muralId]
      );

      if (existingRequest && existingRequest.length > 0) {
        return res.status(409).json({ error: 'Ya has enviado una solicitud de acceso a este mural' });
      }

      // Obtener nombre del usuario que solicita acceso
      const [userData] = await db.query(
        'SELECT nombre FROM usuarios WHERE id_usuario = ?',
        [userId]
      );

      if (!userData || userData.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const userName = userData[0].nombre;

      // Create notification for the creator of the mural
      console.log('Creating notification for creator:', {
        userId,
        creatorId,
        muralId,
        muralTitle,
        userName
      });

      const [creatorResult] = await pool.query(
        `INSERT INTO notificaciones 
         (id_emisor, id_receptor, id_mural, tipo, mensaje, estado_solicitud) 
         VALUES (?, ?, ?, 'solicitud_acceso', ?, 'pendiente')`,
        [
          userId,
          creatorId,
          muralId,
          `${userName} ha solicitado acceso al mural "${muralTitle}"`
        ]
      );
      
      // Obtener la notificación completa para emitir por WebSocket
      const [creatorNotification] = await pool.query(
        `SELECT n.*, u.nombre as nombre_emisor, m.titulo as titulo_mural
         FROM notificaciones n
         LEFT JOIN usuarios u ON n.id_emisor = u.id_usuario
         LEFT JOIN murales m ON n.id_mural = m.id_mural
         WHERE n.id_notificacion = ?`,
        [creatorResult.insertId]
      );
      
      if (creatorNotification.length > 0) {
        // Obtener el objeto io de Express
        const io = req.app.get('io');
        
        // Emitir la notificación al creador
        io.to(`user:${creatorId}`).emit('notification', creatorNotification[0]);
      }

      // Get all admins for the mural (except the creator)
      const [admins] = await pool.query(
        `SELECT id_usuario FROM roles_mural 
         WHERE id_mural = ? AND rol = 'administrador' AND id_usuario != ?`,
        [muralId, creatorId]
      );

      console.log('Found admins:', admins);

      // Crear notificaciones para cada administrador
      if (admins && admins.length > 0) {
        for (const admin of admins) {
          const [adminResult] = await pool.query(
            `INSERT INTO notificaciones 
             (id_emisor, id_receptor, id_mural, tipo, mensaje, estado_solicitud) 
             VALUES (?, ?, ?, 'solicitud_acceso', ?, 'pendiente')`,
            [
              userId,
              admin.id_usuario,
              muralId,
              `${userName} ha solicitado acceso al mural "${muralTitle}"`
            ]
          );
          
          // Obtener la notificación completa para emitir por WebSocket
          const [adminNotification] = await pool.query(
            `SELECT n.*, u.nombre as nombre_emisor, m.titulo as titulo_mural
             FROM notificaciones n
             LEFT JOIN usuarios u ON n.id_emisor = u.id_usuario
             LEFT JOIN murales m ON n.id_mural = m.id_mural
             WHERE n.id_notificacion = ?`,
            [adminResult.insertId]
          );
          
          if (adminNotification.length > 0) {
            // Obtener el objeto io de Express
            const io = req.app.get('io');
            
            // Emitir la notificación al administrador
            io.to(`user:${admin.id_usuario}`).emit('notification', adminNotification[0]);
          }
        }
      }

      res.status(200).json({
        mensaje: 'Solicitud de acceso enviada exitosamente',
        id_mural: muralId
      });
    } catch (error) {
      console.error('Error al solicitar acceso al mural:', error);
      res.status(500).json({ error: 'Error al solicitar acceso al mural' });
    }
  },

  abandonarMural: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verificar si el usuario es el creador del mural
      const [mural] = await db.query(
        'SELECT id_creador FROM murales WHERE id_mural = ?',
        [id]
      );

      if (mural && mural.length > 0 && mural[0].id_creador === userId) {
        return res.status(403).json({ 
          error: 'No puedes abandonar un mural del que eres creador. Debes eliminarlo o transferir la propiedad.' 
        });
      }

      // Eliminar el rol del usuario para este mural
      const [result] = await db.query(
        'DELETE FROM roles_mural WHERE id_usuario = ? AND id_mural = ?',
        [userId, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'No estás asociado a este mural o no existe.' });
      }

      res.json({ mensaje: 'Has abandonado el mural exitosamente' });
    } catch (error) {
      console.error('Error al abandonar el mural:', error);
      res.status(500).json({ error: 'Error al abandonar el mural' });
    }
  }
};

module.exports = muralController; 