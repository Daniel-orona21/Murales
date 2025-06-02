const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Middleware para verificar token
const verificarToken = async (req, res, next) => {
  // Intentar obtener el token del header Authorization: Bearer
  const authHeader = req.header('Authorization');
  let token = null;
  let connection = null;
  
  try {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Eliminar 'Bearer ' del inicio
    } else {
      // Si no está en Authorization, intentar con x-auth-token
      token = req.header('x-auth-token');
    }
    
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'No hay token, autorización denegada' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    
    // Obtener una conexión del pool
    connection = await pool.getConnection();
    
    // Verificar que el token esté asociado a una sesión activa
    const [sesiones] = await connection.query(
      'SELECT * FROM sesiones_usuario WHERE id_usuario = ? AND token = ? AND activa = TRUE',
      [decoded.usuario.id, token]
    );
    
    if (sesiones.length === 0) {
      console.log('Token no asociado a una sesión activa');
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }
    
    // Establecer tanto req.user como req.usuario para mantener compatibilidad
    const userData = {
      id: decoded.usuario.id,
      nombre: decoded.usuario.nombre,
      email: decoded.usuario.email
    };
    
    req.user = userData;
    req.usuario = userData;
    
    console.log('Usuario del token:', userData);
    next();
  } catch (error) {
    console.error('Error al verificar token:', error);
    res.status(401).json({ error: 'Token no válido' });
  } finally {
    // Siempre liberar la conexión al terminar
    if (connection) {
      connection.release();
    }
  }
};

module.exports = verificarToken; 