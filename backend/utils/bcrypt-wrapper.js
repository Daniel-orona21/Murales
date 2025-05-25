// Wrapper para bcrypt que usa bcryptjs como fallback
let bcrypt;

try {
  // Intentar usar bcrypt nativo primero
  bcrypt = require('bcrypt');
  console.log('Using native bcrypt');
} catch (error) {
  // Si bcrypt falla, usar bcryptjs como fallback
  bcrypt = require('bcryptjs');
  console.log('Using bcryptjs fallback');
}

module.exports = bcrypt; 