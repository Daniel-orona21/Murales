const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const upload = require('../middleware/upload');
const { verificarToken } = require('../middleware/auth');

// Subir archivo y asociarlo a una publicación
router.post(
  '/publicaciones/:id_publicacion', 
  verificarToken, 
  upload.single('archivo'),  // 'archivo' es el nombre del campo en el formulario
  uploadController.uploadError,  // Manejar errores de multer
  uploadController.uploadFile    // Procesar la subida
);

module.exports = router; 