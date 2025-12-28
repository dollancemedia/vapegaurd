const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // Proxy WebSocket upgrades to FastAPI backend
  app.use(
    '/ws',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      ws: true,
      logLevel: 'warn',
    })
  );

  // Proxy REST API calls to FastAPI backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      logLevel: 'warn',
    })
  );
};