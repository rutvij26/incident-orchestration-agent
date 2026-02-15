module.exports = {
  port: process.env.PORT || 3000,
  database: {
    host: 'localhost',
    name: 'order_db'
  },
  features: {
    telemetry: {
      enabled: true,
      apiKey: 'some_key'
    },
    syntheticErrorInjection: {
      enabled: true, // Keep enabled if other routes rely on it
      routes: {
        '/api/orders': 0, // Set to 0 to disable synthetic errors for this route
        '/api/products': 0.05
      }
    }
  }
};
