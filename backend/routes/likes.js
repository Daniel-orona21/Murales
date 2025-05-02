const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { verificarToken } = require('../middleware/auth');

// Toggle like (add/remove)
router.post('/toggle/:publicacionId', verificarToken, async (req, res) => {
  const { publicacionId } = req.params;
  const userId = req.user.id;

  console.log('Toggle like - User ID:', userId, 'Publication ID:', publicacionId);

  try {
    // Verificar si el usuario ya tiene un like para esta publicación
    const [existingLike] = await pool.query(
      'SELECT * FROM likes WHERE id_publicacion = ? AND id_usuario = ?',
      [publicacionId, userId]
    );

    if (existingLike.length > 0) {
      // Si ya existe un like, lo removemos
      await pool.query(
        'DELETE FROM likes WHERE id_publicacion = ? AND id_usuario = ?',
        [publicacionId, userId]
      );
      return res.json({ liked: false, message: 'Like removido' });
    }

    // Si no existe un like, lo agregamos
    await pool.query(
      'INSERT INTO likes (id_publicacion, id_usuario) VALUES (?, ?)',
      [publicacionId, userId]
    );

    return res.json({ liked: true, message: 'Like agregado' });
  } catch (error) {
    console.error('Error al manejar like:', error);
    res.status(500).json({ error: 'Error al procesar el like' });
  }
});

// Get likes count for a publication
router.get('/count/:publicacionId', async (req, res) => {
  const { publicacionId } = req.params;

  try {
    const [result] = await pool.query(
      'SELECT COUNT(*) as count FROM likes WHERE id_publicacion = ?',
      [publicacionId]
    );
    res.json({ count: result[0].count });
  } catch (error) {
    console.error('Error al obtener conteo de likes:', error);
    res.status(500).json({ error: 'Error al obtener conteo de likes' });
  }
});

// Check if user has liked a publication
router.get('/check/:publicacionId', verificarToken, async (req, res) => {
  const { publicacionId } = req.params;
  const userId = req.user.id_usuario;

  try {
    const [result] = await pool.query(
      'SELECT * FROM likes WHERE id_publicacion = ? AND id_usuario = ?',
      [publicacionId, userId]
    );
    res.json({ liked: result.length > 0 });
  } catch (error) {
    console.error('Error al verificar like:', error);
    res.status(500).json({ error: 'Error al verificar like' });
  }
});

// Get all likes data for multiple publications
router.post('/bulk', verificarToken, async (req, res) => {
  const { publicacionIds } = req.body;
  const userId = req.user.id;

  console.log('Token user:', req.user);
  console.log('User ID from token:', userId);

  if (!Array.isArray(publicacionIds) || publicacionIds.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de IDs de publicaciones' });
  }

  if (!userId) {
    console.error('No se pudo obtener el ID del usuario del token');
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    // Get likes count for all publications
    const [counts] = await pool.query(
      `SELECT id_publicacion, COUNT(*) as count 
       FROM likes 
       WHERE id_publicacion IN (?) 
       GROUP BY id_publicacion`,
      [publicacionIds]
    );

    // Get user likes for all publications
    const [userLikes] = await pool.query(
      `SELECT DISTINCT id_publicacion 
       FROM likes 
       WHERE id_publicacion IN (?) 
       AND id_usuario = ?`,
      [publicacionIds, userId]
    );

    // Format response
    const response = {
      counts: {},
      userLikes: {}
    };

    // Initialize all counts to 0 and user likes to false
    publicacionIds.forEach(id => {
      response.counts[id] = 0;
      response.userLikes[id] = false;
    });

    // Fill in actual counts
    counts.forEach(count => {
      response.counts[count.id_publicacion] = count.count;
    });

    // Fill in user likes
    userLikes.forEach(like => {
      response.userLikes[like.id_publicacion] = true;
    });

    console.log('Bulk likes response for user', userId, ':', response);
    res.json(response);
  } catch (error) {
    console.error('Error al obtener datos de likes:', error);
    res.status(500).json({ error: 'Error al obtener datos de likes' });
  }
});

module.exports = router; 