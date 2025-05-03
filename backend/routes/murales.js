const express = require('express');
const router = express.Router();
const muralController = require('../controllers/muralController');
const { verificarToken } = require('../middleware/auth');

// Get user's murals
router.get('/usuario', verificarToken, muralController.getMuralesByUsuario);

// Get single mural by ID
router.get('/:id', verificarToken, muralController.getMuralById);

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