import express from 'express';
import bodyParser from 'body-parser';
import pino from 'pino';

const app = express();
const port = 3000;

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: () => `,"time":${Date.now()}`,
});

app.use(bodyParser.json());

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

interface Order {
  userId: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
}

const orders: Order[] = []; // In-memory store for simplicity

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.post('/api/orders', (req, res) => {
  try {
    const { userId, items } = req.body;

    if (!userId) {
      logger.warn({ type: 'validation_error', route: '/api/orders', msg: 'Missing userId' });
      return res.status(400).json({ error: 'userId is required' });
    }

    // FIX: Ensure 'items' is an array before attempting to call 'reduce()'.
    // The error `Cannot read properties of null (reading 'reduce')` indicates `items` itself is null or undefined.
    const safeItems = Array.isArray(items) ? items : [];
    
    // The original error occurred on the next line when 'items' was null/undefined.
    const total = safeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const newOrder: Order = {
      userId,
      items: safeItems, // Use the now-guaranteed-to-be-array 'safeItems'
      total,
      status: 'pending',
      createdAt: Date.now(),
    };

    orders.push(newOrder);
    logger.info({ type: 'order_created', route: '/api/orders', orderId: newOrder.createdAt, userId });
    res.status(201).json(newOrder);

  } catch (error: any) {
    logger.error({
      level: 'error',
      type: 'null_reference_order_items', // Keeping original error type for consistency in monitoring
      route: '/api/orders',
      error: error.message,
      stack: error.stack,
      msg: `CRITICAL: /api/orders crashed — ${error.message}`,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
