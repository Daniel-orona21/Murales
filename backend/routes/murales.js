const express = require('express');
const router = express.Router();
const verificarToken = require('../middleware/auth');
const muralController = require('../controllers/muralController');

// Get user's murals
router.get('/usuario', verificarToken, muralController.getMuralesByUsuario);

// Get mural by ID
router.get('/:id', verificarToken, muralController.getMuralById);

// Get mural users
router.get('/:id/usuarios', verificarToken, muralController.getUsuariosByMural);

// Update user role in mural
router.put('/:id_mural/usuarios/:id_usuario/rol', verificarToken, muralController.actualizarRolUsuario);

// Expulsar usuario del mural
router.delete('/:id_mural/usuarios/:id_usuario/expulsar', verificarToken, muralController.expulsarUsuario);

// Update mural theme
router.put('/:id/tema', verificarToken, muralController.updateMuralTheme);

// Create new mural
router.post('/', verificarToken, muralController.createMural);

// Update mural by ID
router.put('/:id', verificarToken, muralController.updateMural);

// Delete mural by ID
router.delete('/:id', verificarToken, muralController.deleteMural);

// Join mural with access code
router.post('/solicitar-acceso', verificarToken, muralController.joinMuralWithCode);

// Abandon mural by ID
router.delete('/:id/abandonar', verificarToken, muralController.abandonarMural);

// Transfer mural ownership
router.post('/:id/transferir', verificarToken, muralController.transferirPropiedad);

// NUEVAS RUTAS PARA PUBLICACIONES

// Obtener todas las publicaciones de un mural
router.get('/:id_mural/publicaciones', verificarToken, muralController.getPublicacionesByMural);

// Crear una nueva publicación en un mural
router.post('/:id_mural/publicaciones', verificarToken, muralController.crearPublicacion);

// Obtener una publicación específica
router.get('/publicaciones/:id_publicacion', verificarToken, muralController.getPublicacionById);

// Actualizar una publicación
router.put('/publicaciones/:id_publicacion', verificarToken, muralController.actualizarPublicacion);

// Actualizar contenido de una publicación
router.put('/publicaciones/:id_publicacion/contenido', verificarToken, muralController.actualizarContenido);

// Agregar contenido a una publicación
router.post('/publicaciones/:id_publicacion/contenido', verificarToken, muralController.agregarContenido);

// Eliminar una publicación
router.delete('/publicaciones/:id_publicacion', verificarToken, muralController.eliminarPublicacion);

module.exports = router; 