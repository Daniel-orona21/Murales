const pool = require('../config/database');
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

      const [murales] = await pool.query(query, [userId, userId, userId, userId]);
      
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
        SELECT m.*, 
               CASE 
                 WHEN m.id_creador = ? THEN 'administrador'
                 ELSE COALESCE(rm.rol, 'lector') 
               END as rol_usuario
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE m.id_mural = ? AND (m.id_creador = ? OR rm.id_usuario = ?)
      `;

      const [mural] = await pool.query(query, [userId, userId, id, userId, userId]);

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
        const [existingCode] = await pool.query(
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

      const [result] = await pool.query(query, [titulo, descripcion, userId, privacidad, codigoAcceso]);

      // Crear el rol de administrador para el creador
      const rolQuery = `
        INSERT INTO roles_mural (id_usuario, id_mural, rol, fecha_asignacion)
        VALUES (?, ?, 'administrador', NOW())
      `;

      await pool.query(rolQuery, [userId, result.insertId]);

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

      const [mural] = await pool.query(checkQuery, [id, userId, userId]);

      if (!mural || mural.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para editar este mural' });
      }

      const updateQuery = `
        UPDATE murales 
        SET titulo = ?, descripcion = ?, privacidad = ?, fecha_actualizacion = NOW()
        WHERE id_mural = ?
      `;

      await pool.query(updateQuery, [titulo, descripcion, privacidad, id]);

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

      const [mural] = await pool.query(checkQuery, [id, userId, userId]);

      if (!mural || mural.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para eliminar este mural' });
      }

      // Eliminar roles asociados
      await pool.query('DELETE FROM roles_mural WHERE id_mural = ?', [id]);
      
      // Eliminar mural
      await pool.query('DELETE FROM murales WHERE id_mural = ?', [id]);

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

      // Verificar si el mural existe y obtener su privacidad
      const [mural] = await pool.query(
        'SELECT id_mural, titulo, id_creador, privacidad FROM murales WHERE codigo_acceso = ?',
        [codigo]
      );

      console.log('Resultado de búsqueda del mural:', mural);

      if (!mural || mural.length === 0) {
        return res.status(404).json({ error: 'Mural no encontrado. El código de acceso no es válido.' });
      }

      const muralId = mural[0].id_mural;
      const muralTitle = mural[0].titulo;
      const creatorId = mural[0].id_creador;
      const esPrivado = mural[0].privacidad === 'privado';

      // Verificar si el usuario ya está asociado al mural
      const [existingRole] = await pool.query(
        'SELECT id_rol FROM roles_mural WHERE id_usuario = ? AND id_mural = ?',
        [userId, muralId]
      );

      console.log('Rol existente:', existingRole);

      if (existingRole && existingRole.length > 0) {
        return res.status(409).json({ error: 'Ya te encuentras asociado a este mural' });
      }

      // Obtener nombre del usuario que solicita acceso
      const [userData] = await pool.query(
        'SELECT nombre FROM usuarios WHERE id_usuario = ?',
        [userId]
      );

      if (!userData || userData.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const userName = userData[0].nombre;

      // Si el mural es público, dar acceso inmediato
      if (!esPrivado) {
        console.log(`Mural público: acceso inmediato para ${userName} al mural ${muralTitle}`);

      // Agregar al usuario con rol de lector
        await pool.query(
          'INSERT INTO roles_mural (id_usuario, id_mural, rol, fecha_asignacion) VALUES (?, ?, "lector", NOW())',
          [userId, muralId]
        );
        
        // Crear notificación informativa para el creador
        const [creatorResult] = await pool.query(
          `INSERT INTO notificaciones 
           (id_emisor, id_receptor, id_mural, tipo, mensaje) 
           VALUES (?, ?, ?, 'otro', ?)`,
          [
            userId,
            creatorId,
            muralId,
            `${userName} se ha unido al mural "${muralTitle}"`
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
        
        // Notificar a todos los administradores (excepto el creador)
        const [admins] = await pool.query(
          `SELECT id_usuario FROM roles_mural 
           WHERE id_mural = ? AND rol = 'administrador' AND id_usuario != ?`,
          [muralId, creatorId]
        );
        
        if (admins && admins.length > 0) {
          for (const admin of admins) {
            const [adminResult] = await pool.query(
              `INSERT INTO notificaciones 
               (id_emisor, id_receptor, id_mural, tipo, mensaje) 
               VALUES (?, ?, ?, 'otro', ?)`,
              [
                userId,
                admin.id_usuario,
                muralId,
                `${userName} se ha unido al mural "${muralTitle}"`
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
        
        return res.status(200).json({
          mensaje: `Te has unido al mural "${muralTitle}" exitosamente`,
          id_mural: muralId,
          acceso_inmediato: true
        });
      }
      
      // Si llegamos aquí, el mural es privado y requiere aprobación
      
      // Verificar si ya existe una solicitud pendiente
      const [existingRequest] = await pool.query(
        `SELECT id_notificacion FROM notificaciones 
         WHERE id_emisor = ? AND id_mural = ? AND tipo = 'solicitud_acceso' AND estado_solicitud = 'pendiente'`,
        [userId, muralId]
      );

      if (existingRequest && existingRequest.length > 0) {
        return res.status(409).json({ error: 'Ya has enviado una solicitud de acceso a este mural' });
      }

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
        id_mural: muralId,
        acceso_inmediato: false
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
      const [mural] = await pool.query(
        'SELECT id_creador FROM murales WHERE id_mural = ?',
        [id]
      );

      if (mural && mural.length > 0 && mural[0].id_creador === userId) {
        return res.status(403).json({ 
          error: 'No puedes abandonar un mural del que eres creador. Debes eliminarlo o transferir la propiedad.' 
        });
      }

      // Eliminar el rol del usuario para este mural
      const [result] = await pool.query(
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
  },

  // Nueva función para crear una publicación en un mural
  crearPublicacion: async (req, res) => {
    try {
      const { id_mural } = req.params;
      const { titulo, descripcion, posicion_x, posicion_y } = req.body;
      const id_usuario = req.user.id;
      
      // Verificar si el usuario tiene permisos para crear publicaciones en este mural
      const checkQuery = `
        SELECT m.*, rm.rol 
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE m.id_mural = ? AND (m.id_creador = ? OR rm.id_usuario = ?)
      `;
      
      const [mural] = await pool.query(checkQuery, [id_usuario, id_mural, id_usuario, id_usuario]);
      
      if (!mural || mural.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para acceder a este mural' });
      }
      
      const isCreator = mural[0].id_creador == id_usuario;
      const userRole = mural[0].rol || (isCreator ? 'administrador' : null);
      
      // Verificar si el usuario tiene permisos para crear publicaciones
      if (userRole !== 'administrador' && userRole !== 'editor') {
        return res.status(403).json({ error: 'No tienes permisos para crear publicaciones en este mural' });
      }
      
      // Insertar la publicación
      const insertQuery = `
        INSERT INTO publicaciones (
          id_mural, id_usuario, titulo, descripcion, 
          fecha_creacion, fecha_actualizacion, 
          posicion_x, posicion_y, estado
        ) VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?, 1)
      `;
      
      const [result] = await pool.query(insertQuery, [
        id_mural, id_usuario, titulo, descripcion, 
        posicion_x || 0, posicion_y || 0
      ]);
      
      res.status(201).json({
        id_publicacion: result.insertId,
        id_mural,
        id_usuario,
        titulo,
        descripcion,
        posicion_x: posicion_x || 0,
        posicion_y: posicion_y || 0,
        mensaje: 'Publicación creada exitosamente'
      });
      
    } catch (error) {
      console.error('Error al crear publicación:', error);
      res.status(500).json({ error: 'Error al crear la publicación' });
    }
  },
  
  // Función para agregar contenido a una publicación
  agregarContenido: async (req, res) => {
    try {
      const { id_publicacion } = req.params;
      const { tipo_contenido, url_contenido, texto, nombre_archivo, tamano_archivo } = req.body;
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
      
      // Verificar permisos para agregar contenido
      if (!isPublicationAuthor && userRole !== 'administrador' && userRole !== 'editor') {
        return res.status(403).json({ error: 'No tienes permisos para agregar contenido a esta publicación' });
      }
      
      // Verificar tipo de contenido válido
      const tiposValidos = ['imagen', 'video', 'enlace', 'archivo', 'texto'];
      if (!tiposValidos.includes(tipo_contenido)) {
        return res.status(400).json({ error: 'Tipo de contenido no válido' });
      }
      
      // Insertar el contenido
      const insertQuery = `
        INSERT INTO contenido (
          id_publicacion, tipo_contenido, url_contenido,
          texto, nombre_archivo, tamano_archivo, fecha_subida
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;
      
      const [result] = await pool.query(insertQuery, [
        id_publicacion, tipo_contenido, url_contenido,
        texto, nombre_archivo, tamano_archivo
      ]);
      
      res.status(201).json({
        id_contenido: result.insertId,
        id_publicacion,
        tipo_contenido,
        url_contenido,
        texto,
        nombre_archivo,
        tamano_archivo,
        mensaje: 'Contenido agregado exitosamente'
      });
      
    } catch (error) {
      console.error('Error al agregar contenido:', error);
      res.status(500).json({ error: 'Error al agregar contenido a la publicación' });
    }
  },
  
  // Función para obtener publicaciones de un mural
  getPublicacionesByMural: async (req, res) => {
    try {
      const { id_mural } = req.params;
      const id_usuario = req.user.id;
      
      // Verificar acceso al mural
      const checkQuery = `
        SELECT m.*, rm.rol 
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE m.id_mural = ? AND (m.id_creador = ? OR rm.id_usuario = ?)
      `;
      
      const [mural] = await pool.query(checkQuery, [id_usuario, id_mural, id_usuario, id_usuario]);
      
      if (!mural || mural.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para acceder a este mural' });
      }
      
      // Obtener publicaciones del mural
      const query = `
        SELECT p.*, u.nombre as nombre_usuario, u.avatar_url
        FROM publicaciones p
        JOIN usuarios u ON p.id_usuario = u.id_usuario
        WHERE p.id_mural = ? AND p.estado = 1
        ORDER BY p.fecha_creacion DESC
      `;
      
      const [publicaciones] = await pool.query(query, [id_mural]);
      
      // Obtener el contenido para cada publicación
      for (let i = 0; i < publicaciones.length; i++) {
        const contenidoQuery = `
          SELECT * FROM contenido 
          WHERE id_publicacion = ?
          ORDER BY fecha_subida DESC
        `;
        
        const [contenido] = await pool.query(contenidoQuery, [publicaciones[i].id_publicacion]);
        publicaciones[i].contenido = contenido;
      }
      
      res.json(publicaciones);
      
    } catch (error) {
      console.error('Error al obtener publicaciones:', error);
      res.status(500).json({ error: 'Error al obtener las publicaciones del mural' });
    }
  },
  
  // Función para obtener una publicación específica
  getPublicacionById: async (req, res) => {
    try {
      const { id_publicacion } = req.params;
      const id_usuario = req.user.id;
      
      // Verificar permisos y obtener publicación
      const query = `
        SELECT p.*, u.nombre as nombre_usuario, u.avatar_url, m.id_creador, rm.rol
        FROM publicaciones p
        JOIN usuarios u ON p.id_usuario = u.id_usuario
        JOIN murales m ON p.id_mural = m.id_mural
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE p.id_publicacion = ? AND (m.id_creador = ? OR rm.id_usuario = ?)
      `;
      
      const [publicacion] = await pool.query(query, [id_usuario, id_publicacion, id_usuario, id_usuario]);
      
      if (!publicacion || publicacion.length === 0) {
        return res.status(404).json({ error: 'Publicación no encontrada o no tienes permisos para verla' });
      }
      
      // Obtener contenido
      const contenidoQuery = `
        SELECT * FROM contenido 
        WHERE id_publicacion = ?
        ORDER BY fecha_subida DESC
      `;
      
      const [contenido] = await pool.query(contenidoQuery, [id_publicacion]);
      publicacion[0].contenido = contenido;
      
      res.json(publicacion[0]);
      
    } catch (error) {
      console.error('Error al obtener publicación:', error);
      res.status(500).json({ error: 'Error al obtener la publicación' });
    }
  },

  actualizarPublicacion: async (req, res) => {
    try {
      const { id_publicacion } = req.params;
      const { titulo, descripcion } = req.body;
      const userId = req.user.id;

      // Verificar si el usuario tiene permisos para editar
      const checkQuery = `
        SELECT p.*, m.id_creador, rm.rol 
        FROM publicaciones p
        JOIN murales m ON p.id_mural = m.id_mural
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE p.id_publicacion = ? AND (m.id_creador = ? OR (rm.id_usuario = ? AND rm.rol IN ('administrador', 'editor')))
      `;

      const [publicacion] = await pool.query(checkQuery, [userId, id_publicacion, userId, userId]);

      if (!publicacion || publicacion.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para editar esta publicación' });
      }

      const updateQuery = `
        UPDATE publicaciones 
        SET titulo = ?, descripcion = ?, fecha_actualizacion = NOW()
        WHERE id_publicacion = ?
      `;

      await pool.query(updateQuery, [titulo, descripcion, id_publicacion]);

      res.json({ 
        mensaje: 'Publicación actualizada exitosamente',
        id_publicacion,
        titulo,
        descripcion
      });
    } catch (error) {
      console.error('Error al actualizar publicación:', error);
      res.status(500).json({ error: 'Error al actualizar la publicación' });
    }
  },

  actualizarContenido: async (req, res) => {
    try {
      const { id_publicacion } = req.params;
      const { tipo_contenido, url_contenido, texto } = req.body;
      const userId = req.user.id;

      // Verificar si el usuario tiene permisos para editar
      const checkQuery = `
        SELECT p.*, m.id_creador, rm.rol 
        FROM publicaciones p
        JOIN murales m ON p.id_mural = m.id_mural
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE p.id_publicacion = ? AND (m.id_creador = ? OR (rm.id_usuario = ? AND rm.rol IN ('administrador', 'editor')))
      `;

      const [publicacion] = await pool.query(checkQuery, [userId, id_publicacion, userId, userId]);

      if (!publicacion || publicacion.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para editar esta publicación' });
      }

      // Obtener el contenido actual
      const [contenidoActual] = await pool.query(
        'SELECT id_contenido FROM contenido WHERE id_publicacion = ?',
        [id_publicacion]
      );

      if (!contenidoActual || contenidoActual.length === 0) {
        return res.status(404).json({ error: 'No se encontró contenido para actualizar' });
      }

      const id_contenido = contenidoActual[0].id_contenido;

      // Actualizar el contenido
      const updateQuery = `
        UPDATE contenido 
        SET tipo_contenido = ?, 
            url_contenido = ?, 
            texto = ?,
            fecha_subida = NOW()
        WHERE id_contenido = ?
      `;

      await pool.query(updateQuery, [tipo_contenido, url_contenido, texto, id_contenido]);

      res.json({ 
        mensaje: 'Contenido actualizado exitosamente',
        id_contenido,
        tipo_contenido,
        url_contenido,
        texto
      });
    } catch (error) {
      console.error('Error al actualizar contenido:', error);
      res.status(500).json({ error: 'Error al actualizar el contenido' });
    }
  },

  eliminarPublicacion: async (req, res) => {
    try {
      const { id_publicacion } = req.params;
      const userId = req.user.id;

      // Verificar si el usuario tiene permisos para eliminar la publicación
      const checkQuery = `
        SELECT p.*, m.id_creador, rm.rol 
        FROM publicaciones p
        JOIN murales m ON p.id_mural = m.id_mural
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE p.id_publicacion = ? AND (m.id_creador = ? OR (rm.id_usuario = ? AND rm.rol IN ('administrador', 'editor')))
      `;

      const [publicacion] = await pool.query(checkQuery, [userId, id_publicacion, userId, userId]);

      if (!publicacion || publicacion.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para eliminar esta publicación' });
      }

      // Eliminar la publicación
      await pool.query('DELETE FROM publicaciones WHERE id_publicacion = ?', [id_publicacion]);

      res.json({ mensaje: 'Publicación eliminada exitosamente' });
    } catch (error) {
      console.error('Error al eliminar publicación:', error);
      res.status(500).json({ error: 'Error al eliminar la publicación' });
    }
  },

  // Función para obtener usuarios de un mural
  getUsuariosByMural: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verificar si el usuario tiene acceso al mural
      const checkQuery = `
        SELECT m.*, rm.rol 
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE m.id_mural = ? AND (m.id_creador = ? OR rm.id_usuario = ?)
      `;

      const [mural] = await pool.query(checkQuery, [userId, id, userId, userId]);

      if (!mural || mural.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para acceder a este mural' });
      }

      // Obtener todos los usuarios del mural
      const query = `
        SELECT 
          u.id_usuario,
          u.nombre,
          u.avatar_url,
          CASE 
            WHEN m.id_creador = u.id_usuario THEN 'administrador'
            ELSE COALESCE(rm.rol, 'lector')
          END as rol
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural
        LEFT JOIN usuarios u ON (rm.id_usuario = u.id_usuario OR m.id_creador = u.id_usuario)
        WHERE m.id_mural = ?
        GROUP BY u.id_usuario
        ORDER BY 
          CASE 
            WHEN m.id_creador = u.id_usuario THEN 1
            WHEN rm.rol = 'administrador' THEN 2
            WHEN rm.rol = 'editor' THEN 3
            ELSE 4
          END,
          u.nombre ASC
      `;

      const [usuarios] = await pool.query(query, [id]);

      res.json(usuarios);
    } catch (error) {
      console.error('Error al obtener usuarios del mural:', error);
      res.status(500).json({ error: 'Error al obtener los usuarios del mural' });
    }
  },

  // Función para actualizar el rol de un usuario en un mural
  actualizarRolUsuario: async (req, res) => {
    try {
      const { id_mural, id_usuario } = req.params;
      const { rol } = req.body;
      const userId = req.user.id;

      // Verificar que el rol sea válido
      const rolesValidos = ['lector', 'editor', 'administrador'];
      if (!rolesValidos.includes(rol)) {
        return res.status(400).json({ error: 'Rol no válido' });
      }

      // Verificar si el usuario que hace la petición tiene permisos de administrador
      const checkQuery = `
        SELECT m.*, rm.rol, m.titulo
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE m.id_mural = ? AND (m.id_creador = ? OR (rm.id_usuario = ? AND rm.rol = 'administrador'))
      `;

      const [mural] = await pool.query(checkQuery, [userId, id_mural, userId, userId]);

      if (!mural || mural.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para modificar roles en este mural' });
      }

      // Verificar que el usuario a modificar exista en el mural
      const [usuarioMural] = await pool.query(
        'SELECT * FROM roles_mural WHERE id_mural = ? AND id_usuario = ?',
        [id_mural, id_usuario]
      );

      if (!usuarioMural || usuarioMural.length === 0) {
        return res.status(404).json({ error: 'El usuario no está asociado a este mural' });
      }

      // No permitir cambiar el rol del creador del mural
      if (mural[0].id_creador == id_usuario) {
        return res.status(403).json({ error: 'No se puede cambiar el rol del creador del mural' });
      }

      // Actualizar el rol
      const updateQuery = `
        UPDATE roles_mural 
        SET rol = ?
        WHERE id_mural = ? AND id_usuario = ?
      `;

      await pool.query(updateQuery, [rol, id_mural, id_usuario]);

      // Obtener el nombre del usuario que recibe el nuevo rol
      const [userData] = await pool.query(
        'SELECT nombre FROM usuarios WHERE id_usuario = ?',
        [id_usuario]
      );

      if (userData && userData.length > 0) {
        // Crear notificación para el usuario
        const [notificationResult] = await pool.query(
          `INSERT INTO notificaciones 
           (id_emisor, id_receptor, id_mural, tipo, mensaje) 
           VALUES (?, ?, ?, 'otro', ?)`,
          [
            userId,
            id_usuario,
            id_mural,
            `Se te ha otorgado el rol de "${rol}" en el mural "${mural[0].titulo}"`
          ]
        );

        // Obtener la notificación completa para emitir por WebSocket
        const [notification] = await pool.query(
          `SELECT n.*, u.nombre as nombre_emisor, m.titulo as titulo_mural
           FROM notificaciones n
           LEFT JOIN usuarios u ON n.id_emisor = u.id_usuario
           LEFT JOIN murales m ON n.id_mural = m.id_mural
           WHERE n.id_notificacion = ?`,
          [notificationResult.insertId]
        );

        if (notification.length > 0) {
          // Obtener el objeto io de Express
          const io = req.app.get('io');
          
          // Emitir la notificación al usuario
          io.to(`user:${id_usuario}`).emit('notification', notification[0]);
        }
      }

      res.json({ 
        mensaje: 'Rol actualizado exitosamente',
        id_usuario,
        id_mural,
        rol
      });
    } catch (error) {
      console.error('Error al actualizar rol:', error);
      res.status(500).json({ error: 'Error al actualizar el rol del usuario' });
    }
  },

  // Actualizar tema del mural
  updateMuralTheme: async (req, res) => {
    try {
      const { id } = req.params;
      const { tema, color_personalizado } = req.body;
      const userId = req.user.id;

      // Verificar si el usuario tiene permisos de administrador
      const checkQuery = `
        SELECT m.*, 
               CASE 
                 WHEN m.id_creador = ? THEN 'administrador'
                 ELSE COALESCE(rm.rol, 'lector') 
               END as rol_usuario
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural AND rm.id_usuario = ?
        WHERE m.id_mural = ? AND (m.id_creador = ? OR rm.id_usuario = ?)
      `;

      const [mural] = await pool.query(checkQuery, [userId, userId, id, userId, userId]);

      if (!mural || mural.length === 0) {
        return res.status(404).json({ mensaje: 'Mural no encontrado' });
      }

      if (mural[0].rol_usuario !== 'administrador') {
        return res.status(403).json({ mensaje: 'No tienes permisos para actualizar el tema' });
      }

      // Actualizar el tema
      const updateData = {};
      if (tema !== undefined) updateData.tema = tema;
      if (color_personalizado !== undefined) updateData.color_personalizado = color_personalizado;
      updateData.fecha_actualizacion = new Date();

      await pool.query(
        `UPDATE murales 
         SET ? 
         WHERE id_mural = ?`,
        [updateData, id]
      );

      res.json({ mensaje: 'Tema actualizado correctamente' });
    } catch (error) {
      console.error('Error al actualizar tema:', error);
      res.status(500).json({ mensaje: 'Error al actualizar el tema' });
    }
  },

  transferirPropiedad: async (req, res) => {
    try {
      const { id } = req.params;
      const { id_nuevo_propietario } = req.body;
      const userId = req.user.id;

      // Primero verificar si el mural existe
      const [muralExists] = await pool.query(
        'SELECT * FROM murales WHERE id_mural = ?',
        [id]
      );

      if (muralExists.length === 0) {
        return res.status(404).json({ error: 'El mural no existe' });
      }

      // Verificar que el usuario actual es el creador del mural
      const [mural] = await pool.query(
        'SELECT * FROM murales WHERE id_mural = ? AND id_creador = ?',
        [id, userId]
      );

      if (mural.length === 0) {
        return res.status(403).json({ 
          error: 'Solo el creador del mural puede transferir la propiedad',
          detail: 'El usuario actual no es el creador de este mural'
        });
      }

      // Verificar que el nuevo propietario existe y es un usuario del mural
      const [usuario] = await pool.query(
        'SELECT * FROM roles_mural WHERE id_mural = ? AND id_usuario = ?',
        [id, id_nuevo_propietario]
      );

      if (usuario.length === 0) {
        return res.status(404).json({ error: 'El usuario seleccionado no es miembro del mural' });
      }

      // Iniciar transacción
      await pool.query('START TRANSACTION');

      try {
        // Actualizar el creador del mural
        await pool.query(
          'UPDATE murales SET id_creador = ? WHERE id_mural = ?',
          [id_nuevo_propietario, id]
        );

        // Eliminar el rol de administrador del creador actual
        await pool.query(
          'DELETE FROM roles_mural WHERE id_mural = ? AND id_usuario = ?',
          [id, userId]
        );

        // Crear notificación para el nuevo propietario
        const [notificationResult] = await pool.query(
          `INSERT INTO notificaciones 
           (id_emisor, id_receptor, id_mural, tipo, mensaje) 
           VALUES (?, ?, ?, 'otro', ?)`,
          [
            userId,
            id_nuevo_propietario,
            id,
            `Has sido nombrado nuevo propietario del mural "${mural[0].titulo}"`
          ]
        );

        // Obtener la notificación completa para emitir por WebSocket
        const [notification] = await pool.query(
          `SELECT n.*, u.nombre as nombre_emisor, m.titulo as titulo_mural
           FROM notificaciones n
           LEFT JOIN usuarios u ON n.id_emisor = u.id_usuario
           LEFT JOIN murales m ON n.id_mural = m.id_mural
           WHERE n.id_notificacion = ?`,
          [notificationResult.insertId]
        );

        if (notification.length > 0) {
          // Obtener el objeto io de Express
          const io = req.app.get('io');
          
          // Emitir la notificación al nuevo propietario
          io.to(`user:${id_nuevo_propietario}`).emit('notification', notification[0]);
        }

        await pool.query('COMMIT');
        res.json({ mensaje: 'Propiedad transferida exitosamente' });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('Error al transferir propiedad del mural:', error);
      res.status(500).json({ error: 'Error al transferir propiedad del mural' });
    }
  }
};

module.exports = muralController; 