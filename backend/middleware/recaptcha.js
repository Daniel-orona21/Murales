const axios = require('axios');

const verifyRecaptcha = async (req, res, next) => {
  const { recaptchaToken } = req.body;

  if (!recaptchaToken) {
    return res.status(400).json({ mensaje: 'Token de reCAPTCHA no proporcionado' });
  }

  try {
    const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
      params: {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaToken
      }
    });

    if (!response.data.success) {
      return res.status(400).json({ mensaje: 'Verificación de reCAPTCHA fallida' });
    }

    next();
  } catch (error) {
    console.error('Error al verificar reCAPTCHA:', error);
    res.status(500).json({ mensaje: 'Error al verificar reCAPTCHA' });
  }
};

module.exports = verifyRecaptcha; 