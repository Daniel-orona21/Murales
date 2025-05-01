const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const muralController = {
  getMuralesByUsuario: async (req, res) => {
    try {
      const userId = req.user.id;

      if (!userId) {
        return res.status(400).json({ error: 'ID de usuario no encontrado en el token' });
      }

      const query = `
        SELECT m.* 
        FROM murales m
        LEFT JOIN roles_mural rm ON m.id_mural = rm.id_mural
        WHERE m.id_creador = ? OR rm.id_usuario = ?
        GROUP BY m.id_mural
        ORDER BY m.fecha_creacion DESC
      `;

      const [murales] = await db.query(query, [userId, userId]);
      
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
  }
};

module.exports = muralController; 