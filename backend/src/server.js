import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { chainTicketManager } from './engine/ticketing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(join(__dirname, '../../frontend')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ChainTicket',
    version: '1.0.0',
    network: config.network,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = chainTicketManager.getPlatformStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events', (req, res) => {
  try {
    const events = chainTicketManager.listEvents();
    res.json({ total: events.length, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/:id', (req, res) => {
  try {
    const ev = chainTicketManager.getEventDetails(parseInt(req.params.id, 10));
    if (!ev) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(ev);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', (req, res) => {
  try {
    const { organizer, name, venue, eventTimestamp, faceValue, maxResalePrice, royaltyBps, maxCapacity } = req.body;
    const ev = chainTicketManager.createEvent({
      organizer,
      name,
      venue,
      eventTimestamp,
      faceValue: parseFloat(faceValue),
      maxResalePrice: parseFloat(maxResalePrice),
      royaltyBps: royaltyBps ? parseInt(royaltyBps, 10) : 500,
      maxCapacity: parseInt(maxCapacity, 10)
    });
    res.status(201).json(ev);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/events/:id/mint', (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    const { recipient, recipientName } = req.body;
    const result = chainTicketManager.mintTicket({ eventId, recipient, recipientName });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/tickets/:id/resell', (req, res) => {
  try {
    const tokenId = parseInt(req.params.id, 10);
    const { fromAddress, toAddress, toName, resalePrice } = req.body;
    const result = chainTicketManager.resellTicket({
      tokenId,
      fromAddress,
      toAddress,
      toName,
      resalePrice: parseFloat(resalePrice)
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/tickets/:id/checkin', (req, res) => {
  try {
    const tokenId = parseInt(req.params.id, 10);
    const { qrHash } = req.body;
    const result = chainTicketManager.checkInTicket({ tokenId, qrHash });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users/:address/tickets', (req, res) => {
  try {
    const tickets = chainTicketManager.listUserTickets(req.params.address);
    res.json({ total: tickets.length, tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`ChainTicket Anti-Scalping Gateway listening on port ${config.port}`);
  });
}

export default app;
