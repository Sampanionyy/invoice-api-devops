const express = require('express');
const { v4: uuidv4 } = require('uuid');
const client = require('prom-client');

const app = express();
app.use(express.json());

// ─── Prometheus Metrics ───────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  registers: [register],
});

const invoicesTotal = new client.Gauge({
  name: 'invoices_total',
  help: 'Total number of invoices',
  registers: [register],
});

// Middleware metrics
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({ method: req.method, route: req.path });
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, route: req.path, status: res.statusCode });
    end();
  });
  next();
});

// ─── In-memory store ─────────────────────────────────────────────────────────
let invoices = [];

// ─── TVA Rates ────────────────────────────────────────────────────────────────
const TVA_RATES = {
  standard: 0.20,   // 20%
  reduit: 0.10,     // 10%
  super_reduit: 0.055, // 5.5%
  zero: 0.00,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calculateInvoice(items, tvaType = 'standard') {
  const tvaRate = TVA_RATES[tvaType] ?? TVA_RATES.standard;
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tvaAmount = parseFloat((subtotal * tvaRate).toFixed(2));
  const total = parseFloat((subtotal + tvaAmount).toFixed(2));
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    tvaRate,
    tvaPercent: `${(tvaRate * 100).toFixed(1)}%`,
    tvaAmount,
    total,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Metrics (Prometheus)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// GET /invoices - list all
app.get('/invoices', (req, res) => {
  res.json({ count: invoices.length, invoices });
});

// GET /invoices/:id
app.get('/invoices/:id', (req, res) => {
  const invoice = invoices.find(i => i.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});

// POST /invoices - create
app.post('/invoices', (req, res) => {
  const { client: clientName, items, tvaType = 'standard', dueDate } = req.body;

  if (!clientName || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'Missing required fields: client, items (array)',
      example: {
        client: 'Acme Corp',
        tvaType: 'standard',
        dueDate: '2025-12-31',
        items: [{ description: 'Service web', quantity: 2, unitPrice: 500 }],
      },
    });
  }

  const calculation = calculateInvoice(items, tvaType);
  const invoice = {
    id: uuidv4(),
    number: `INV-${String(invoices.length + 1).padStart(4, '0')}`,
    client: clientName,
    status: 'draft',
    createdAt: new Date().toISOString(),
    dueDate: dueDate || null,
    items: items.map(i => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: parseFloat((i.quantity * i.unitPrice).toFixed(2)),
    })),
    ...calculation,
  };

  invoices.push(invoice);
  invoicesTotal.set(invoices.length);
  res.status(201).json(invoice);
});

// PATCH /invoices/:id/status
app.patch('/invoices/:id/status', (req, res) => {
  const invoice = invoices.find(i => i.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const validStatuses = ['draft', 'sent', 'paid', 'cancelled'];
  const { status } = req.body;
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
  }

  invoice.status = status;
  invoice.updatedAt = new Date().toISOString();
  res.json(invoice);
});

// DELETE /invoices/:id
app.delete('/invoices/:id', (req, res) => {
  const index = invoices.findIndex(i => i.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Invoice not found' });

  invoices.splice(index, 1);
  invoicesTotal.set(invoices.length);
  res.json({ message: 'Invoice deleted' });
});

// GET /tva-rates
app.get('/tva-rates', (req, res) => {
  res.json({
    rates: Object.entries(TVA_RATES).map(([key, value]) => ({
      type: key,
      rate: value,
      percent: `${(value * 100).toFixed(1)}%`,
    })),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Invoice API running on port ${PORT}`));
