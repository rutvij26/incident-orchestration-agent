import express from 'express';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid'; // Assuming uuid is used somewhere

const app = express();
const port = 3000;

app.use(bodyParser.json());

// --- Interfaces ---
interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  customer_id?: string;
  items: OrderItem[] | null; // Can be null based on incident
  totalPrice: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// --- In-memory Data Stores (for demo purposes) ---
const products: Product[] = [
  { id: 'prod1', name: 'Laptop', description: 'Powerful laptop', price: 1200, stock: 50 },
  { id: 'prod2', name: 'Mouse', description: 'Wireless mouse', price: 25, stock: 200 },
];
const orders: Order[] = [];

// --- Routes ---

// GET /api/products
app.get('/api/products', (req, res) => {
  console.log('GET /api/products');
  res.status(200).json(products);
});

// GET /api/products/:id
app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (product) {
    res.status(200).json(product);
  } else {
    res.status(404).json({ error: 'Product not found' });
  }
});

// POST /api/orders
app.post('/api/orders', (req, res) => {
  console.log('POST /api/orders received');
  const { customer_id, items } = req.body; // items can be null or undefined

  if (!customer_id) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }
  // FIX: Ensure items is an array before calling reduce to prevent null reference errors.
  // This directly addresses the 'TypeError: Cannot read properties of null (reading 'reduce')' at line 61.
  const totalPrice = (items || []).reduce((sum, item) => sum + item.price * item.quantity, 0);

  const newOrder: Order = {
    id: uuidv4(),
    customer_id,
    items, // Store original items, which could be null or undefined based on input
    totalPrice,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  orders.push(newOrder);
  console.log(`Order created: ${newOrder.id}`);
  res.status(201).json(newOrder);
});

// GET /api/orders
app.get('/api/orders', (req, res) => {
  console.log('GET /api/orders');
  res.status(200).json(orders);
});

// Health Check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
