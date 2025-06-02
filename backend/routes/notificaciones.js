const express = require('express');
const router = express.Router();
const verificarToken = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// Todas las rutas de este archivo requieren autenticación
router.use(verificarToken);

// Obtener todas las notificaciones del usuario actual
router.get('/', notificationController.getNotifications);

// Procesar solicitud de acceso (aprobar o rechazar)
router.put('/:id/procesar', notificationController.processAccessRequest);

// Eliminar una notificación
router.delete('/:id', notificationController.deleteNotification);

module.exports = router; 