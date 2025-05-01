const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Importar la configuración de base de datos
const { conectarDB } = require('./config/db');

// Importar middleware de limitación de tasa
const { apiLimiter } = require('./middleware/rateLimit');

// Crear la aplicación Express
const app = express();

// Configurar CORS
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Aplicar limitador de tasa a todas las solicitudes de la API
app.use('/api', apiLimiter);

// Rutas
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/murales', require('./routes/murales'));

// Conectar a la base de datos
conectarDB();

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API de Murales funcionando correctamente' });
});

// Manejador de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    mensaje: 'Error en el servidor',
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));