const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { verificarToken } = require('../middleware/auth');

// Obtener comentarios de una publicación
router.get('/publicacion/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT c.*, u.nombre as nombre_usuario, u.avatar_url
      FROM comentarios c
      JOIN usuarios u ON c.id_usuario = u.id_usuario
      WHERE c.id_publicacion = ? AND c.estado = 1
      ORDER BY c.fecha_creacion DESC
    `;
    
    const [comentarios] = await pool.query(query, [id]);
    res.json(comentarios);
  } catch (error) {
    console.error('Error al obtener comentarios:', error);
    res.status(500).json({ mensaje: 'Error al obtener los comentarios' });
  }
});

// Agregar un comentario
router.post('/', verificarToken, async (req, res) => {
  try {
    const { id_publicacion, contenido } = req.body;
    const id_usuario = req.user.id;

    const query = `
      INSERT INTO comentarios (id_publicacion, id_usuario, contenido)
      VALUES (?, ?, ?)
    `;
    
    const [result] = await pool.query(query, [id_publicacion, id_usuario, contenido]);
    
    // Obtener el comentario recién creado con la información del usuario
    const [comentario] = await pool.query(`
      SELECT c.*, u.nombre as nombre_usuario, u.avatar_url
      FROM comentarios c
      JOIN usuarios u ON c.id_usuario = u.id_usuario
      WHERE c.id_comentario = ?
    `, [result.insertId]);

    res.status(201).json(comentario[0]);
  } catch (error) {
    console.error('Error al agregar comentario:', error);
    res.status(500).json({ mensaje: 'Error al agregar el comentario' });
  }
});

// Eliminar un comentario
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;

    // Verificar si el usuario es el propietario del comentario o es admin
    const [comentario] = await pool.query(
      'SELECT * FROM comentarios WHERE id_comentario = ?',
      [id]
    );

    if (!comentario[0]) {
      return res.status(404).json({ mensaje: 'Comentario no encontrado' });
    }

    // Verificar si el usuario es el propietario del comentario
    if (comentario[0].id_usuario !== id_usuario) {
      // Verificar si el usuario es admin
      const [usuario] = await pool.query(
        'SELECT rol FROM roles_mural WHERE id_usuario = ? AND rol = "administrador"',
        [id_usuario]
      );

      if (!usuario[0]) {
        return res.status(403).json({ mensaje: 'No tienes permiso para eliminar este comentario' });
      }
    }

    // Eliminar el comentario (soft delete)
    await pool.query(
      'UPDATE comentarios SET estado = 0 WHERE id_comentario = ?',
      [id]
    );

    res.json({ mensaje: 'Comentario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar comentario:', error);
    res.status(500).json({ mensaje: 'Error al eliminar el comentario' });
  }
});

module.exports = router; 