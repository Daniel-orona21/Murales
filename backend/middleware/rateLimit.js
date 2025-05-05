const rateLimit = require('express-rate-limit');

// Limitar los intentos de inicio de sesión
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Limitar a 5 solicitudes por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    mensaje: 'Demasiados intentos de inicio de sesión. Por favor, intente de nuevo después de 15 minutos.'
  }
});

// Limitar las solicitudes de recuperación de contraseña
const recuperarPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Limitar a 3 solicitudes por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    mensaje: 'Demasiadas solicitudes de recuperación de contraseña. Por favor, intente de nuevo después de 1 hora.'
  }
});

// Limitar las solicitudes de registro
const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // Limitar a 5 solicitudes por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    mensaje: 'Demasiados intentos de registro. Por favor, intente de nuevo después de 1 hora.'
  }
});

// Limitar las solicitudes generales a la API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Limitar a 200 solicitudes por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    mensaje: 'Demasiadas solicitudes a la API. Por favor, intente de nuevo más tarde.'
  }
});

module.exports = {
  loginLimiter,
  recuperarPasswordLimiter,
  registroLimiter,
  apiLimiter
}; 