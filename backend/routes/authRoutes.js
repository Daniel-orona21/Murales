const express = require('express');
const { check } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const verificarToken = require('../middleware/auth');
const { loginLimiter, recuperarPasswordLimiter, registroLimiter } = require('../middleware/rateLimit');
const verifyRecaptcha = require('../middleware/recaptcha');

// Ruta para registro de usuarios
// POST /api/auth/registro
router.post('/registro', registroLimiter, verifyRecaptcha, [
  check('nombre', 'El nombre es obligatorio').not().isEmpty(),
  check('email', 'Incluye un email válido').isEmail(),
  check('contrasena', 'La contraseña debe tener al menos 6 caracteres').isLength({ min: 6 })
], authController.registrar);

// Ruta para inicio de sesión
// POST /api/auth/login
router.post('/login', loginLimiter, [
  check('email', 'Incluye un email válido').isEmail(),
  check('contrasena', 'La contraseña es obligatoria').exists()
], authController.iniciarSesion);

// Ruta para obtener usuario autenticado
// GET /api/auth/usuario
router.get('/usuario', verificarToken, authController.obtenerUsuario);

// Ruta para obtener el ID del usuario actual
// GET /api/auth/current-user
router.get('/current-user', verificarToken, authController.obtenerUsuarioActual);

// Ruta para obtener sesiones activas
// GET /api/auth/sessions
router.get('/sessions', verificarToken, authController.obtenerSesionesActivas);

// Ruta para cerrar sesión
// POST /api/auth/logout/:idSesion
router.post('/logout/:idSesion', verificarToken, authController.cerrarSesion);

// Ruta para solicitar restablecimiento de contraseña
// POST /api/auth/recuperar-password
router.post('/recuperar-password', recuperarPasswordLimiter, authController.solicitarResetPassword);

// Ruta para verificar token de restablecimiento
// GET /api/auth/verificar-token/:token
router.get('/verificar-token/:token', authController.verificarTokenReset);

// Ruta para restablecer contraseña
// POST /api/auth/restablecer-password/:token
router.post('/restablecer-password/:token', [
  check('contrasena', 'La nueva contraseña debe tener al menos 6 caracteres').isLength({ min: 6 })
], authController.restablecerPassword);

// Ruta para autenticación con Google
// POST /api/auth/google
router.post('/google', authController.autenticarConGoogle);

// Ruta para autenticación con GitHub
// POST /api/auth/github/callback
router.post('/github/callback', authController.autenticarConGithub);

module.exports = router; 