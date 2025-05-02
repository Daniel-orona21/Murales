const jwt = require('jsonwebtoken');

// Middleware para verificar token
const verificarToken = (req, res, next) => {
  const token = req.header('x-auth-token');
  
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'No hay token, autorización denegada' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);
    
    // Asegurarnos de que el usuario tenga el formato correcto
    req.user = {
      id: decoded.usuario.id,
      nombre: decoded.usuario.nombre,
      email: decoded.usuario.email
    };
    
    console.log('Usuario del token:', req.user);
    next();
  } catch (error) {
    console.error('Error al verificar token:', error);
    res.status(401).json({ error: 'Token no válido' });
  }
};

module.exports = { verificarToken }; 