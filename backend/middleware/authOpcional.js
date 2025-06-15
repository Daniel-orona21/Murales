const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Middleware para verificar token de forma opcional
const verificarTokenOpcional = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  let token = null;
  let connection = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = req.header('x-auth-token');
  }

  if (!token) {
    // No hay token, pero el acceso es opcional, así que continuamos sin usuario autenticado
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    connection = await pool.getConnection();
    
    const [sesiones] = await connection.query(
      'SELECT * FROM sesiones_usuario WHERE id_usuario = ? AND token = ? AND activa = TRUE',
      [decoded.usuario.id, token]
    );

    if (sesiones.length > 0) {
      const userData = {
        id: decoded.usuario.id,
        nombre: decoded.usuario.nombre,
        email: decoded.usuario.email
      };
      
      req.user = userData;
      req.usuario = userData;
    }
    // Si la sesión no es válida, no hacemos nada y dejamos que continúe sin usuario autenticado
    
    next();
  } catch (error) {
    // Si el token es inválido, no es un error fatal, simplemente no se autentica al usuario.
    next();
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = verificarTokenOpcional; 