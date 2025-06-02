const pool = require('../config/database');

// Crear una nueva notificación
exports.createNotification = async (req, res) => {
  const { id_receptor, id_mural, tipo, mensaje } = req.body;
  const id_emisor = req.user.id;
  
  try {
    const [result] = await pool.query(
      `INSERT INTO notificaciones 
       (id_emisor, id_receptor, id_mural, tipo, mensaje) 
       VALUES (?, ?, ?, ?, ?)`,
      [id_emisor, id_receptor, id_mural, tipo, mensaje]
    );
    
    const notificationId = result.insertId;
    
    // Obtener la notificación completa para emitir por WebSocket
    const [notificaciones] = await pool.query(
      `SELECT n.*, u.nombre as nombre_emisor, m.titulo as titulo_mural
       FROM notificaciones n
       LEFT JOIN usuarios u ON n.id_emisor = u.id_usuario
       LEFT JOIN murales m ON n.id_mural = m.id_mural
       WHERE n.id_notificacion = ?`,
      [notificationId]
    );
    
    if (notificaciones.length > 0) {
      const notification = notificaciones[0];
      
      // Obtener el objeto io de Express
      const io = req.app.get('io');
      
      // Emitir la notificación al usuario receptor
      io.to(`user:${id_receptor}`).emit('notification', notification);
    }
    
    res.status(201).json({ 
      message: 'Notificación creada correctamente',
      id_notificacion: notificationId
    });
  } catch (error) {
    console.error('Error al crear notificación:', error);
    res.status(500).json({ error: 'Error al crear notificación' });
  }
};

// Obtener todas las notificaciones del usuario actual
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Getting notifications for user:', userId);
    
    const [notificaciones] = await pool.query(
      `SELECT n.*, u.nombre as nombre_emisor, m.titulo as titulo_mural
       FROM notificaciones n
       LEFT JOIN usuarios u ON n.id_emisor = u.id_usuario
       LEFT JOIN murales m ON n.id_mural = m.id_mural
       WHERE n.id_receptor = ? AND n.leido = 0
       ORDER BY n.fecha_creacion DESC`,
      [userId]
    );
    
    console.log('Found notifications:', notificaciones.length);
    console.log('Notification data:', notificaciones);
    
    res.json(notificaciones);
  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

// Marcar una notificación como leída y eliminarla
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    
    console.log(`Attempting to mark and delete notification ${notificationId} for user ${userId}`);
    
    // Verificar que la notificación pertenezca al usuario
    const [notificacion] = await pool.query(
      'SELECT * FROM notificaciones WHERE id_notificacion = ? AND id_receptor = ?',
      [notificationId, userId]
    );
    
    if (notificacion.length === 0) {
      console.log(`Notification ${notificationId} not found or doesn't belong to user ${userId}`);
      
      // Check if the notification exists at all (might belong to another user)
      const [anyNotification] = await pool.query(
        'SELECT id_notificacion FROM notificaciones WHERE id_notificacion = ?',
        [notificationId]
      );
      
      if (anyNotification.length === 0) {
        console.log(`Notification ${notificationId} doesn't exist in the database at all`);
        // It's already gone, so we can consider this a success
        return res.json({ message: 'Notificación ya fue procesada previamente' });
      }
      
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    
    // En lugar de marcar como leída, eliminar directamente
    await pool.query(
      'DELETE FROM notificaciones WHERE id_notificacion = ?',
      [notificationId]
    );
    
    // Obtener el objeto io de Express
    const io = req.app.get('io');
    
    // Emitir evento de notificación eliminada
    io.to(`user:${userId}`).emit('notification_delete', notificationId);
    
    console.log(`Successfully deleted notification ${notificationId}`);
    res.json({ message: 'Notificación marcada como leída y eliminada' });
  } catch (error) {
    console.error('Error al marcar y eliminar notificación:', error);
    res.status(500).json({ error: 'Error al procesar la notificación' });
  }
};

// Marcar todas las notificaciones como leídas
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Obtener IDs de todas las notificaciones no leídas para el usuario
    const [notificaciones] = await pool.query(
      'SELECT id_notificacion FROM notificaciones WHERE id_receptor = ? AND leido = 0',
      [userId]
    );
    
    // Eliminar todas las notificaciones no leídas
    if (notificaciones.length > 0) {
      await pool.query(
        'DELETE FROM notificaciones WHERE id_receptor = ? AND leido = 0',
        [userId]
      );
      
      // Obtener el objeto io de Express
      const io = req.app.get('io');
      
      // Emitir eventos de eliminación para cada notificación
      for (const notificacion of notificaciones) {
        io.to(`user:${userId}`).emit('notification_delete', notificacion.id_notificacion);
      }
    }
    
    res.json({ message: 'Todas las notificaciones marcadas como leídas y eliminadas' });
  } catch (error) {
    console.error('Error al marcar todas las notificaciones como leídas:', error);
    res.status(500).json({ error: 'Error al marcar todas las notificaciones como leídas' });
  }
};

// Procesar solicitud de acceso (aprobar o rechazar)
exports.processAccessRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    const { aprobada } = req.body;
    
    console.log(`Processing access request ${notificationId} by user ${userId}, approved: ${aprobada}`);
    
    if (typeof aprobada !== 'boolean') {
      return res.status(400).json({ error: 'Se requiere un valor booleano para "aprobada"' });
    }
    
    // Comenzar una transacción para asegurar consistencia
    await pool.query('START TRANSACTION');
    
    // Obtener la información de la notificación
    const [notificacion] = await pool.query(
      `SELECT n.*, m.id_creador, m.titulo as titulo_mural
       FROM notificaciones n
       JOIN murales m ON n.id_mural = m.id_mural
       WHERE n.id_notificacion = ? AND n.tipo = 'solicitud_acceso'`,
      [notificationId]
    );
    
    if (notificacion.length === 0) {
      console.log(`Notification ${notificationId} not found in database`);
      
      // Check if the notification exists at all
      const [anyNotification] = await pool.query(
        'SELECT id_notificacion FROM notificaciones WHERE id_notificacion = ?',
        [notificationId]
      );
      
      if (anyNotification.length === 0) {
        console.log(`Notification ${notificationId} doesn't exist at all, might be already processed`);
        await pool.query('ROLLBACK');
        // It's already gone, return success to avoid confusing the user
        return res.json({ 
          message: 'Solicitud ya fue procesada anteriormente',
          aprobada
        });
      }
      
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }
    
    const solicitud = notificacion[0];
    
    // if the solicitud is already processed (not 'pendiente'), return success
    if (solicitud.estado_solicitud && solicitud.estado_solicitud !== 'pendiente') {
      console.log(`Notification ${notificationId} already processed with status: ${solicitud.estado_solicitud}`);
      await pool.query('ROLLBACK');
      return res.json({ 
        message: `Solicitud ya fue ${solicitud.estado_solicitud === 'aprobada' ? 'aprobada' : 'rechazada'} anteriormente`,
        aprobada: solicitud.estado_solicitud === 'aprobada'
      });
    }
    
    // Verificar que el usuario actual es administrador del mural o su creador
    const [rolUsuario] = await pool.query(
      `SELECT * FROM roles_mural 
       WHERE id_mural = ? AND id_usuario = ? 
       AND (rol = 'administrador' OR id_usuario = ?)`,
      [solicitud.id_mural, userId, solicitud.id_creador]
    );
    
    if (rolUsuario.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permisos para procesar esta solicitud' });
    }
    
    // Eliminar la notificación original
    await pool.query(
      'DELETE FROM notificaciones WHERE id_notificacion = ?',
      [notificationId]
    );
    
    // Obtener el objeto io de Express
    const io = req.app.get('io');
    
    // Emitir evento de notificación eliminada para todos los receptores
    io.to(`user:${userId}`).emit('notification_delete', notificationId);
    
    // Si se aprueba, añadir el rol de lector al usuario
    if (aprobada) {
      // Verificar si ya existe una asignación de rol para este usuario en este mural
      const [existingRole] = await pool.query(
        'SELECT * FROM roles_mural WHERE id_mural = ? AND id_usuario = ?',
        [solicitud.id_mural, solicitud.id_emisor]
      );
      
      if (existingRole.length === 0) {
        await pool.query(
          'INSERT INTO roles_mural (id_usuario, id_mural, rol) VALUES (?, ?, "lector")',
          [solicitud.id_emisor, solicitud.id_mural]
        );
      }
      
      // Usar el título del mural que ya obtenemos en la consulta inicial
      const muralTitle = solicitud.titulo_mural || 'desconocido';
      
      // Crear notificación para el solicitante
      const [result] = await pool.query(
        `INSERT INTO notificaciones 
         (id_emisor, id_receptor, id_mural, tipo, mensaje) 
         VALUES (?, ?, ?, 'invitacion', ?)`,
        [
          userId,
          solicitud.id_emisor,
          solicitud.id_mural,
          `Tu solicitud de acceso al mural "${muralTitle}" ha sido aprobada. Ya puedes acceder a él.`
        ]
      );
      
      // Obtener la notificación completa para emitir por WebSocket
      const [nuevaNotificacion] = await pool.query(
        `SELECT n.*, u.nombre as nombre_emisor, m.titulo as titulo_mural
         FROM notificaciones n
         LEFT JOIN usuarios u ON n.id_emisor = u.id_usuario
         LEFT JOIN murales m ON n.id_mural = m.id_mural
         WHERE n.id_notificacion = ?`,
        [result.insertId]
      );
      
      if (nuevaNotificacion.length > 0) {
        // Emitir la nueva notificación al solicitante
        io.to(`user:${solicitud.id_emisor}`).emit('notification', nuevaNotificacion[0]);
      }
    } else {
      // Si se rechaza, eliminar cualquier solicitud pendiente del mismo usuario para este mural
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE id_emisor = ? AND id_mural = ? AND tipo = 'solicitud_acceso' AND estado_solicitud = 'pendiente'`,
        [solicitud.id_emisor, solicitud.id_mural]
      );
      
      // Usar el título del mural que ya obtenemos en la consulta inicial
      const muralTitle = solicitud.titulo_mural || 'desconocido';
      
      // Crear notificación para el solicitante informando que fue rechazado
      const [result] = await pool.query(
        `INSERT INTO notificaciones 
         (id_emisor, id_receptor, id_mural, tipo, mensaje) 
         VALUES (?, ?, ?, 'invitacion', ?)`,
        [
          userId,
          solicitud.id_emisor,
          solicitud.id_mural,
          `Tu solicitud de acceso al mural "${muralTitle}" ha sido rechazada.`
        ]
      );
      
      // Obtener la notificación completa para emitir por WebSocket
      const [nuevaNotificacion] = await pool.query(
        `SELECT n.*, u.nombre as nombre_emisor, m.titulo as titulo_mural
         FROM notificaciones n
         LEFT JOIN usuarios u ON n.id_emisor = u.id_usuario
         LEFT JOIN murales m ON n.id_mural = m.id_mural
         WHERE n.id_notificacion = ?`,
        [result.insertId]
      );
      
      if (nuevaNotificacion.length > 0) {
        // Emitir la nueva notificación al solicitante
        io.to(`user:${solicitud.id_emisor}`).emit('notification', nuevaNotificacion[0]);
      }
    }
    
    await pool.query('COMMIT');
    
    res.json({ 
      message: aprobada ? 'Solicitud de acceso aprobada' : 'Solicitud de acceso rechazada',
      aprobada
    });
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al procesar solicitud de acceso:', error);
    res.status(500).json({ error: 'Error al procesar solicitud de acceso' });
  }
};

// Eliminar una notificación
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    
    console.log(`Attempting to delete notification ${notificationId} for user ${userId}`);
    
    // Verificar que la notificación pertenezca al usuario
    const [notificacion] = await pool.query(
      'SELECT * FROM notificaciones WHERE id_notificacion = ? AND id_receptor = ?',
      [notificationId, userId]
    );
    
    if (notificacion.length === 0) {
      console.log(`Notification ${notificationId} not found or doesn't belong to user ${userId}`);
      
      // Check if notification exists at all
      const [anyNotification] = await pool.query(
        'SELECT id_notificacion FROM notificaciones WHERE id_notificacion = ?',
        [notificationId]
      );
      
      if (anyNotification.length === 0) {
        console.log(`Notification ${notificationId} doesn't exist at all`);
        return res.json({ message: 'Notificación ya eliminada' });
      }
      
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    
    // Eliminar la notificación
    await pool.query(
      'DELETE FROM notificaciones WHERE id_notificacion = ?',
      [notificationId]
    );
    
    // Obtener el objeto io de Express
    const io = req.app.get('io');
    
    // Emitir evento de notificación eliminada
    io.to(`user:${userId}`).emit('notification_delete', notificationId);
    
    console.log(`Successfully deleted notification ${notificationId}`);
    res.json({ message: 'Notificación eliminada' });
  } catch (error) {
    console.error('Error al eliminar notificación:', error);
    res.status(500).json({ error: 'Error al eliminar notificación' });
  }
}; 