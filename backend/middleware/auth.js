const jwt = require('jsonwebtoken');

// Middleware para verificar token
const verificarToken = (req, res, next) => {
  const token = req.header('x-auth-token');
  
  if (!token) {
    return res.status(401).json({ mensaje: 'Acceso denegado. Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded.usuario;
    next();
  } catch (error) {
    res.status(401).json({ mensaje: 'Token no válido' });
  }
};

module.exports = { verificarToken }; 