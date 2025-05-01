const { pool } = require('../config/db');

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
    
    await pool.query(
      'UPDATE notificaciones SET leido = 1 WHERE id_receptor = ? AND leido = 0',
      [userId]
    );
    
    res.json({ message: 'Todas las notificaciones marcadas como leídas' });
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
      `SELECT n.*, m.id_creador 
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
    
    // Eliminar la notificación original en lugar de actualizar su estado
    await pool.query(
      'DELETE FROM notificaciones WHERE id_notificacion = ?',
      [notificationId]
    );
    
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
      
      // Crear notificación para el solicitante
      await pool.query(
        `INSERT INTO notificaciones 
         (id_emisor, id_receptor, id_mural, tipo, mensaje) 
         VALUES (?, ?, ?, 'invitacion', ?)`,
        [
          userId,
          solicitud.id_emisor,
          solicitud.id_mural,
          `Tu solicitud de acceso al mural ha sido aprobada. Ya puedes acceder a él.`
        ]
      );
    } else {
      // Crear notificación para el solicitante informando que fue rechazado
      await pool.query(
        `INSERT INTO notificaciones 
         (id_emisor, id_receptor, id_mural, tipo, mensaje) 
         VALUES (?, ?, ?, 'invitacion', ?)`,
        [
          userId,
          solicitud.id_emisor,
          solicitud.id_mural,
          `Tu solicitud de acceso al mural ha sido rechazada.`
        ]
      );
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
        // Notification doesn't exist, which is fine - it's already gone
        console.log(`Notification ${notificationId} already deleted`);
        return res.json({ 
          success: true,
          message: 'Notification already deleted or doesn\'t exist' 
        });
      }
      
      // Notification exists but doesn't belong to this user
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    
    // Proceed with deletion
    const result = await pool.query(
      'DELETE FROM notificaciones WHERE id_notificacion = ?',
      [notificationId]
    );
    
    console.log(`Successfully deleted notification ${notificationId}`);
    res.json({
      success: true,
      message: 'Notificación eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar notificación:', error);
    res.status(500).json({ error: 'Error al eliminar notificación' });
  }
}; 