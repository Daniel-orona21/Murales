# Backend de Murales

Backend para la aplicación Murales, un espacio digital interactivo donde los alumnos universitarios pueden crear, compartir y presentar ideas, recursos o proyectos de forma colaborativa (similar a Padlet).

## Requisitos

- Node.js (v14 o superior)
- MySQL (v5.7 o superior)

## Configuración inicial

1. Clona el repositorio:
```
git clone <url-del-repositorio>
cd murales/backend
```

2. Instala las dependencias:
```
npm install
```

3. Crea un archivo `.env` en la raíz del proyecto con las siguientes variables (puedes usar `.env.example` como plantilla):
```
# Configuración de la base de datos
DB_HOST=localhost
DB_USER=root
DB_PASS=tu_contraseña
DB_NAME=murales

# Configuración del servidor
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=tuClaveSecretaAqui
JWT_EXPIRES_IN=24h

# Email (para recuperación de contraseña)
EMAIL_SERVICE=gmail
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contraseña_app

# URL base de la aplicación
BASE_URL=http://localhost:3000
```

4. Configura la base de datos:
   - Crea una base de datos llamada `murales` en MySQL
   - Importa el archivo `murales.sql` en tu base de datos para crear las tablas necesarias

## Ejecución

Para iniciar el servidor en modo desarrollo:
```
node index.js
```

## Características implementadas

- **Autenticación de usuarios**:
  - Registro de nuevos usuarios
  - Inicio de sesión con JWT
  - Verificación de token

- **Seguridad**:
  - Hashing de contraseñas con bcrypt
  - Protección de rutas con JWT
  - Limitación de tasa para prevenir ataques de fuerza bruta
  - Sistema de bloqueo de cuentas tras múltiples intentos fallidos

- **Recuperación de contraseña**:
  - Generación de tokens de recuperación
  - Envío de correos electrónicos para restablecimiento
  - Verificación y actualización de contraseñas

## Endpoints

### Autenticación

- `POST /api/auth/registro` - Registro de nuevos usuarios
- `POST /api/auth/login` - Inicio de sesión
- `GET /api/auth/usuario` - Obtener datos del usuario autenticado
- `POST /api/auth/recuperar-password` - Solicitar recuperación de contraseña
- `GET /api/auth/verificar-token/:token` - Verificar token de recuperación
- `POST /api/auth/restablecer-password/:token` - Restablecer contraseña 