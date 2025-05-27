const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

// Crear una instancia de caché para almacenar los contadores
const rateLimitCache = new NodeCache({ stdTTL: 900 }); // 15 minutos TTL

// Función para obtener la key única para el rate limiting
const getRateLimitKey = (req) => {
  const ip = req.ip;
  const userId = req.user?.id;
  const path = req.path;
  
  // Si es una ruta de autenticación, usar IP + path
  if (path.includes('/auth/')) {
    return `auth_${ip}_${path}`;
  }
  
  // Para rutas autenticadas, usar userId + path
  if (userId) {
    return `user_${userId}_${path}`;
  }
  
  // Para rutas públicas, usar IP + path
  return `public_${ip}_${path}`;
};

// Middleware personalizado de rate limiting
const customRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutos por defecto
    max = 100, // 100 peticiones por defecto
    message = 'Demasiadas peticiones. Por favor, intente de nuevo más tarde.'
  } = options;

  return (req, res, next) => {
    const key = getRateLimitKey(req);
    const now = Date.now();
    
    // Obtener el contador actual
    let counter = rateLimitCache.get(key) || { count: 0, resetTime: now + windowMs };
    
    // Si el tiempo ha expirado, reiniciar el contador
    if (now > counter.resetTime) {
      counter = { count: 0, resetTime: now + windowMs };
    }
    
    // Incrementar el contador
    counter.count++;
    rateLimitCache.set(key, counter);
    
    // Establecer headers de rate limit
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - counter.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(counter.resetTime / 1000));
    
    // Verificar si se excedió el límite
    if (counter.count > max) {
      return res.status(429).json({
        status: 429,
        mensaje: message,
        retryAfter: Math.ceil((counter.resetTime - now) / 1000)
      });
    }
    
    next();
  };
};

// Configuraciones específicas para diferentes rutas
const loginLimiter = customRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, 
  message: 'Demasiados intentos de inicio de sesión. Por favor, intente de nuevo después de 15 minutos.'
});

const recuperarPasswordLimiter = customRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  message: 'Demasiadas solicitudes de recuperación de contraseña. Por favor, intente de nuevo después de 1 hora.'
});

const registroLimiter = customRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: 'Demasiados intentos de registro. Por favor, intente de nuevo después de 1 hora.'
});

// Rate limiter general para la API
const apiLimiter = customRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  message: 'Demasiadas solicitudes a la API. Por favor, intente de nuevo más tarde.'
});

module.exports = {
  loginLimiter,
  recuperarPasswordLimiter,
  registroLimiter,
  apiLimiter
}; 