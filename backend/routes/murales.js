const express = require('express');
const router = express.Router();
const muralController = require('../controllers/muralController');
const { verificarToken } = require('../middleware/auth');

// Get user's murals
router.get('/usuario', verificarToken, muralController.getMuralesByUsuario);

// Create new mural
router.post('/', verificarToken, muralController.createMural);

// Update mural by ID
router.put('/:id', verificarToken, muralController.updateMural);

// Delete mural by ID
router.delete('/:id', verificarToken, muralController.deleteMural);

// Join mural with access code
router.post('/join', verificarToken, muralController.joinMuralWithCode);

// Abandon mural by ID
router.delete('/:id/abandonar', verificarToken, muralController.abandonarMural);

module.exports = router; 