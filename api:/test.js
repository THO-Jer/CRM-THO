// Función simple de prueba para verificar que Vercel Functions funcionan

module.exports = (req, res) => {
  res.status(200).json({ 
    message: '✅ Vercel Functions funcionando!',
    timestamp: new Date().toISOString(),
    method: req.method 
  });
};
