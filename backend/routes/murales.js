const express = require('express');
const router = express.Router();
const verificarToken = require('../middleware/auth');
const muralController = require('../controllers/muralController');

// Rutas de Murales
router.get('/mis-murales', verificarToken, muralController.getMuralesByUsuario);
router.get('/publicos', verificarToken, muralController.getPublicMurales);
router.get('/:id', verificarToken, muralController.getMuralById);
router.post('/', verificarToken, muralController.createMural);
router.put('/:id', verificarToken, muralController.updateMural);
router.delete('/:id', verificarToken, muralController.deleteMural);

// Rutas de Acceso y Miembros
router.post('/unirse', verificarToken, muralController.joinMuralWithCode);
router.post('/:id/unirse-publico', verificarToken, muralController.joinPublicMural);
router.post('/:id/abandonar', verificarToken, muralController.abandonarMural);
router.post('/:id/transferir', verificarToken, muralController.transferirPropiedad);

// Rutas de Gestión de Usuarios del Mural
router.get('/:id/usuarios', verificarToken, muralController.getUsuariosByMural);
router.put('/:id_mural/usuarios/:id_usuario/rol', verificarToken, muralController.actualizarRolUsuario);
router.delete('/:id_mural/usuarios/:id_usuario/expulsar', verificarToken, muralController.expulsarUsuario);

// Rutas de Personalización
router.put('/:id/tema', verificarToken, muralController.updateMuralTheme);


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