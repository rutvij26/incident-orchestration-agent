import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Placeholder for some data or a mock database
interface OrderItem {
  productId: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalPrice: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
}

const orders: Order[] = [];
let orderIdCounter = 1;

app.get('/', (req: Request, res: Response) => {
  res.send('Order Service is running!');
});

// Incident-related route
app.post('/api/orders', (req: Request, res: Response) => {
  const { userId, items } = req.body; // items could be null or undefined

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Fix: Use nullish coalescing to default `items` to an empty array if null/undefined
  const totalPrice = (items ?? []).reduce((sum, item) => sum + item.price * item.quantity, 0);

  const newOrder: Order = {
    id: `order-${orderIdCounter++}`,
    userId,
    items: items ?? [], // Ensure items is an array in the stored order as well
    totalPrice,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  orders.push(newOrder);
  res.status(201).json(newOrder);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
