const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'murales',
  waitForConnections: true,
  connectionLimit: 4,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  idleTimeout: 60000,
  maxIdle: 4
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de MySQL:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Se perdió la conexión con la base de datos.');
  }
});

module.exports = pool; 