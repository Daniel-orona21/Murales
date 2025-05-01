const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Importar la configuración de base de datos
const { conectarDB } = require('./config/db');

// Importar middleware de limitación de tasa
const { apiLimiter } = require('./middleware/rateLimit');

// Crear la aplicación Express
const app = express();

// Crear el servidor HTTP
const server = http.createServer(app);

// Configurar Socket.IO con CORS habilitado
const io = socketIo(server, {
  cors: {
    origin: '*', // En producción, restringe esto a tu dominio frontend
    methods: ['GET', 'POST']
  }
});

// Guardar socket.io en la app para usarlo en los controladores
app.set('io', io);

// Configurar CORS
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Aplicar limitador de tasa a todas las solicitudes de la API
app.use('/api', apiLimiter);

// Rutas
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/murales', require('./routes/murales'));
app.use('/api/notificaciones', require('./routes/notificaciones'));

// Conectar a la base de datos
conectarDB();

// Configurar Socket.IO
io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado:', socket.id);
  
  // Autenticar al usuario usando el token del socket
  socket.on('authenticate', (token) => {
    try {
      // Aquí deberías verificar el token y obtener el ID del usuario
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.usuario.id;
      
      console.log('Usuario autenticado en socket:', userId);
      
      // Guardar el userId en el objeto del socket
      socket.userId = userId;
      
      // Unir al usuario a una sala personalizada para sus notificaciones
      socket.join(`user:${userId}`);
      
      // Enviar confirmación al cliente
      socket.emit('authenticated', { success: true });
    } catch (error) {
      console.error('Error al autenticar socket:', error);
      socket.emit('authenticated', { success: false, error: 'Invalid token' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

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
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT} con WebSockets activos`));