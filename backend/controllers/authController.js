const bcrypt = require('../utils/bcrypt-wrapper');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../config/database');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

// Configurar el transporte de correo electrónico
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Registro de usuarios
const registrar = async (req, res) => {
  // Verificar errores de validación
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ errores: errores.array() });
  }

  const { nombre, email, contrasena } = req.body;
  
  try {
    // Verificar si el email ya está registrado
    const [usuarios] = await pool.execute(
      'SELECT * FROM usuarios WHERE email = ?', 
      [email]
    );
    
    if (usuarios.length > 0) {
      return res.status(400).json({ mensaje: 'El usuario ya existe' });
    }
    
    // Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(contrasena, salt);
    
    // Crear nuevo usuario
    const fechaActual = new Date();
    await pool.execute(
      'INSERT INTO usuarios (nombre, email, contrasena, fecha_registro, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, email, hashedPassword, fechaActual, fechaActual, fechaActual]
    );
    
    // Obtener el ID del usuario recién insertado
    const [resultado] = await pool.execute(
      'SELECT id_usuario FROM usuarios WHERE email = ?', 
      [email]
    );
    
    // Crear y devolver token JWT
    const payload = {
      usuario: {
        id: resultado[0].id_usuario,
        nombre: nombre,
        email: email
      }
    };
    
    jwt.sign(
      payload, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' },
      (error, token) => {
        if (error) throw error;
        res.json({ token });
      }
    );
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

// Inicio de sesión
const iniciarSesion = async (req, res) => {
  console.log('Intento de inicio de sesión:', req.body);
  
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    console.log('Errores de validación:', errores.array());
    return res.status(400).json({ errores: errores.array() });
  }

  const { email, contrasena, dispositivo } = req.body;
  
  if (!email || !contrasena) {
    console.log('Faltan campos requeridos:', { email: !!email, contrasena: !!contrasena });
    return res.status(400).json({ mensaje: 'Email y contraseña son requeridos' });
  }

  try {
    // Buscar usuario por email
    const [usuarios] = await pool.execute(
      'SELECT * FROM usuarios WHERE email = ?', 
      [email]
    );
    
    if (usuarios.length === 0) {
      return res.status(400).json({ mensaje: 'Credenciales incorrectas' });
    }
    
    const usuario = usuarios[0];
    
    // Verificar si el usuario está bloqueado
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      return res.status(403).json({ 
        mensaje: `Cuenta bloqueada temporalmente. Intente nuevamente después de ${new Date(usuario.bloqueado_hasta).toLocaleString()}` 
      });
    }
    
    // Verificar contraseña
    const passwordValido = await bcrypt.compare(contrasena, usuario.contrasena);
    
    if (!passwordValido) {
      // Incrementar intentos fallidos
      const nuevoIntentos = usuario.intentos_fallidos + 1;
      
      if (nuevoIntentos >= 5) {
        const tiempoBloqueo = new Date();
        tiempoBloqueo.setMinutes(tiempoBloqueo.getMinutes() + 30);
        
        await pool.execute(
          'UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id_usuario = ?', 
          [0, tiempoBloqueo, usuario.id_usuario]
        );
        
        return res.status(403).json({ 
          mensaje: `Demasiados intentos fallidos. Cuenta bloqueada hasta ${tiempoBloqueo.toLocaleString()}` 
        });
      }
      
      await pool.execute(
        'UPDATE usuarios SET intentos_fallidos = ? WHERE id_usuario = ?', 
        [nuevoIntentos, usuario.id_usuario]
      );
      
      return res.status(400).json({ 
        mensaje: 'Credenciales incorrectas',
        intentosFallidos: nuevoIntentos,
        intentosRestantes: 5 - nuevoIntentos
      });
    }
    
    // Reset de intentos fallidos y actualización de último acceso
    const fechaActual = new Date();
    await pool.execute(
      'UPDATE usuarios SET intentos_fallidos = 0, ultimo_acceso = ?, bloqueado_hasta = NULL WHERE id_usuario = ?', 
      [fechaActual, usuario.id_usuario]
    );
    
    // Crear token JWT
    const payload = {
      usuario: {
        id: usuario.id_usuario,
        nombre: usuario.nombre,
        email: usuario.email
      }
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    // Crear nueva sesión
    const idSesion = uuidv4();
    await pool.execute(
      'INSERT INTO sesiones_usuario (id_sesion, id_usuario, token, dispositivo) VALUES (?, ?, ?, ?)',
      [idSesion, usuario.id_usuario, token, dispositivo || 'Desconocido']
    );
    
    // Obtener todas las sesiones activas del usuario
    const [sesiones] = await pool.execute(
      'SELECT id_sesion, dispositivo, fecha_creacion FROM sesiones_usuario WHERE id_usuario = ? AND activa = TRUE',
      [usuario.id_usuario]
    );
    
    res.json({ 
      token,
      idSesion,
      sesionesActivas: sesiones
    });
    
  } catch (error) {
    console.error('Error en iniciarSesion:', error);
    res.status(500).json({ mensaje: 'Error en el servidor', error: error.message });
  }
};

// Obtener usuario actual con el token
const obtenerUsuario = async (req, res) => {
  try {
    console.log('Request usuario:', req.usuario);
    
    if (!req.usuario || !req.usuario.id) {
      return res.status(401).json({ mensaje: 'Usuario no autenticado' });
    }

    // Obtener usuario desde la base de datos (excluyendo la contraseña)
    const [usuarios] = await pool.execute(
      'SELECT id_usuario, nombre, email, avatar_url, fecha_registro, ultimo_acceso FROM usuarios WHERE id_usuario = ?', 
      [req.usuario.id]
    );
    
    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }
    
    res.json(usuarios[0]);
  } catch (error) {
    console.error('Error en obtenerUsuario:', error);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

// Obtener solo el ID del usuario actual
const obtenerUsuarioActual = async (req, res) => {
  try {
    console.log('User from request:', req.user);
    res.json({ id_usuario: req.user.id });
  } catch (error) {
    console.error('Error in obtenerUsuarioActual:', error);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

// Solicitar restablecimiento de contraseña
const solicitarResetPassword = async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ mensaje: 'Por favor, proporcione un correo electrónico' });
  }
  
  try {
    // Verificar si el email existe
    const [usuarios] = await pool.execute(
      'SELECT * FROM usuarios WHERE email = ?', 
      [email]
    );
    
    if (usuarios.length === 0) {
      // Por seguridad, no informamos al usuario que el email no existe
      return res.status(200).json({ mensaje: 'Si el correo existe, recibirá un enlace para restablecer su contraseña' });
    }
    
    // Generar token único
    const token = uuidv4();
    
    // Establecer expiración (1 hora)
    const expiracion = new Date();
    expiracion.setHours(expiracion.getHours() + 1);
    
    // Guardar token en la base de datos
    await pool.execute(
      'UPDATE usuarios SET token_recuperacion = ?, expiracion_token_recuperacion = ? WHERE id_usuario = ?', 
      [token, expiracion, usuarios[0].id_usuario]
    );
    
    // Enviar correo con enlace de recuperación
    const resetUrl = `${process.env.BASE_URL}/reset-password/${token}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Murales - Recuperación de Contraseña',
      html: `
        <h1>Recuperación de Contraseña</h1>
        <p>Has solicitado restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
        <a href="${resetUrl}" target="_blank">Restablecer contraseña</a>
        <p>Este enlace expirará en 1 hora.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      `
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error al enviar correo:', error);
      } else {
        console.log('Correo enviado:', info.response);
      }
    });
    
    return res.status(200).json({ mensaje: 'Si el correo existe, recibirá un enlace para restablecer su contraseña' });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

// Verificar token de restablecimiento
const verificarTokenReset = async (req, res) => {
  const { token } = req.params;
  
  try {
    // Buscar usuario con el token
    const [usuarios] = await pool.execute(
      'SELECT * FROM usuarios WHERE token_recuperacion = ?', 
      [token]
    );
    
    if (usuarios.length === 0) {
      return res.status(400).json({ valido: false, mensaje: 'Token de restablecimiento inválido' });
    }
    
    const usuario = usuarios[0];
    
    // Verificar si el token ha expirado
    if (!usuario.expiracion_token_recuperacion || new Date(usuario.expiracion_token_recuperacion) < new Date()) {
      return res.status(400).json({ valido: false, mensaje: 'El token de restablecimiento ha expirado' });
    }
    
    res.json({ valido: true, mensaje: 'Token válido' });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

// Restablecer contraseña
const restablecerPassword = async (req, res) => {
  const { token } = req.params;
  const { contrasena } = req.body;
  
  if (!contrasena) {
    return res.status(400).json({ mensaje: 'Por favor, proporcione una nueva contraseña' });
  }
  
  try {
    // Buscar usuario con el token
    const [usuarios] = await pool.execute(
      'SELECT * FROM usuarios WHERE token_recuperacion = ?', 
      [token]
    );
    
    if (usuarios.length === 0) {
      return res.status(400).json({ mensaje: 'Token de restablecimiento inválido' });
    }
    
    const usuario = usuarios[0];
    
    // Verificar si el token ha expirado
    if (!usuario.expiracion_token_recuperacion || new Date(usuario.expiracion_token_recuperacion) < new Date()) {
      return res.status(400).json({ mensaje: 'El token de restablecimiento ha expirado' });
    }
    
    // Hashear la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(contrasena, salt);
    
    // Actualizar contraseña y limpiar token
    const fechaActual = new Date();
    await pool.execute(
      'UPDATE usuarios SET contrasena = ?, token_recuperacion = NULL, expiracion_token_recuperacion = NULL, updated_at = ? WHERE id_usuario = ?', 
      [hashedPassword, fechaActual, usuario.id_usuario]
    );
    
    res.json({ mensaje: 'Contraseña restablecida correctamente' });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

// Cerrar sesión
const cerrarSesion = async (req, res) => {
  const { idSesion } = req.params;
  const userId = req.user.id;

  try {
    // Verificar que la sesión pertenece al usuario
    const [sesiones] = await pool.execute(
      'SELECT * FROM sesiones_usuario WHERE id_sesion = ? AND id_usuario = ?',
      [idSesion, userId]
    );
    
    if (sesiones.length === 0) {
      return res.status(404).json({ mensaje: 'Sesión no encontrada' });
    }
    
    // Marcar la sesión como inactiva
    await pool.execute(
      'UPDATE sesiones_usuario SET activa = FALSE WHERE id_sesion = ?',
      [idSesion]
    );
    
    res.json({ mensaje: 'Sesión cerrada exitosamente' });
    
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

// Obtener sesiones activas
const obtenerSesionesActivas = async (req, res) => {
  const userId = req.user.id;

  try {
    // Verificar que el token de la sesión actual sea válido
    const [sesionActual] = await pool.execute(
      'SELECT * FROM sesiones_usuario WHERE id_usuario = ? AND token IS NOT NULL AND activa = TRUE',
      [userId]
    );
    
    if (sesionActual.length === 0) {
      return res.status(401).json({ mensaje: 'Sesión inválida' });
    }
    
    const [sesiones] = await pool.execute(
      'SELECT id_sesion, dispositivo, fecha_creacion, ultima_actividad FROM sesiones_usuario WHERE id_usuario = ? AND activa = TRUE',
      [userId]
    );
    
    res.json({ sesiones });
    
  } catch (error) {
    console.error('Error al obtener sesiones:', error);
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

// Autenticación con Google
const autenticarConGoogle = async (req, res) => {
  const { email, nombre, uid, photoURL, dispositivo } = req.body;
  
  try {
    // Verificar si el usuario ya existe
    const [usuarios] = await pool.execute(
      'SELECT * FROM usuarios WHERE email = ?', 
      [email]
    );
    
    let userId;
    const fechaActual = new Date();
    
    if (usuarios.length === 0) {
      // Crear nuevo usuario
      const [resultado] = await pool.execute(
        'INSERT INTO usuarios (nombre, email, google_id, avatar_url, fecha_registro, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nombre, email, uid, photoURL, fechaActual, fechaActual, fechaActual]
      );
      userId = resultado.insertId;
    } else {
      // Actualizar usuario existente
      userId = usuarios[0].id_usuario;
      await pool.execute(
        'UPDATE usuarios SET google_id = ?, avatar_url = ?, updated_at = ? WHERE id_usuario = ?',
        [uid, photoURL, fechaActual, userId]
      );
    }
    
    // Crear token JWT
    const payload = {
      usuario: {
        id: userId,
        nombre: nombre,
        email: email
      }
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    // Crear nueva sesión
    const idSesion = uuidv4();
    await pool.execute(
      'INSERT INTO sesiones_usuario (id_sesion, id_usuario, token, dispositivo) VALUES (?, ?, ?, ?)',
      [idSesion, userId, token, dispositivo || 'Desconocido']
    );
    
    // Obtener todas las sesiones activas del usuario
    const [sesiones] = await pool.execute(
      'SELECT id_sesion, dispositivo, fecha_creacion FROM sesiones_usuario WHERE id_usuario = ? AND activa = TRUE',
      [userId]
    );
    
    res.json({ 
      token,
      idSesion,
      sesionesActivas: sesiones
    });
    
  } catch (error) {
    console.error('Error en autenticarConGoogle:', error);
    res.status(500).json({ mensaje: 'Error en el servidor', error: error.message });
  }
};

// Autenticación con GitHub
const autenticarConGithub = async (req, res) => {
  const { code, dispositivo } = req.body;
  
  try {
    // Intercambiar el código por un token de acceso
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code
    }, {
      headers: {
        Accept: 'application/json'
      }
    });

    const accessToken = tokenResponse.data.access_token;
    
    // Obtener información del usuario
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const githubUser = userResponse.data;
    
    // Obtener el email del usuario
    const emailResponse = await axios.get('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const primaryEmail = emailResponse.data.find(email => email.primary)?.email || emailResponse.data[0]?.email;
    
    if (!primaryEmail) {
      return res.status(400).json({ mensaje: 'No se pudo obtener el email del usuario' });
    }

    // Verificar si el usuario ya existe
    const [usuarios] = await pool.execute(
      'SELECT * FROM usuarios WHERE email = ?', 
      [primaryEmail]
    );
    
    let userId;
    const fechaActual = new Date();
    
    if (usuarios.length === 0) {
      // Crear nuevo usuario
      const [resultado] = await pool.execute(
        'INSERT INTO usuarios (nombre, email, github_id, avatar_url, fecha_registro, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [githubUser.name || githubUser.login, primaryEmail, githubUser.id.toString(), githubUser.avatar_url, fechaActual, fechaActual, fechaActual]
      );
      userId = resultado.insertId;
    } else {
      // Actualizar usuario existente
      userId = usuarios[0].id_usuario;
      await pool.execute(
        'UPDATE usuarios SET github_id = ?, avatar_url = ?, updated_at = ? WHERE id_usuario = ?',
        [githubUser.id.toString(), githubUser.avatar_url, fechaActual, userId]
      );
    }
    
    // Crear token JWT
    const payload = {
      usuario: {
        id: userId,
        nombre: githubUser.name || githubUser.login,
        email: primaryEmail
      }
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
    
    // Crear nueva sesión
    const idSesion = uuidv4();
    await pool.execute(
      'INSERT INTO sesiones_usuario (id_sesion, id_usuario, token, dispositivo) VALUES (?, ?, ?, ?)',
      [idSesion, userId, token, dispositivo || 'Desconocido']
    );
    
    // Obtener todas las sesiones activas del usuario
    const [sesiones] = await pool.execute(
      'SELECT id_sesion, dispositivo, fecha_creacion FROM sesiones_usuario WHERE id_usuario = ? AND activa = TRUE',
      [userId]
    );
    
    res.json({ 
      token,
      idSesion,
      sesionesActivas: sesiones
    });
    
  } catch (error) {
    console.error('Error en autenticarConGithub:', error);
    res.status(500).json({ mensaje: 'Error en el servidor', error: error.message });
  }
};

module.exports = {
  registrar,
  iniciarSesion,
  obtenerUsuario,
  obtenerUsuarioActual,
  solicitarResetPassword,
  verificarTokenReset,
  restablecerPassword,
  cerrarSesion,
  obtenerSesionesActivas,
  autenticarConGoogle,
  autenticarConGithub
}; 