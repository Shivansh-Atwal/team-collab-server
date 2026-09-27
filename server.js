import 'dotenv/config';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import { Server } from 'socket.io';

import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import { notFound, errorHandler } from './middleware/error.js';
import registerSocketHandlers from './socket/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
// Frontend origins allowed to call the API (comma-separated in CLIENT_URL).
// "*" wildcards are allowed, e.g. https://*.vercel.app for preview deployments.
const CLIENT_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const escapeRegex = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const originPatterns = CLIENT_ORIGINS.map((o) => new RegExp(`^${o.split('*').map(escapeRegex).join('[^/.]+')}$`));
const warnedOrigins = new Set();
const corsOrigin = (origin, cb) => {
  // No Origin header = same-origin, curl, health checks
  if (!origin || originPatterns.some((re) => re.test(origin))) return cb(null, true);
  if (!warnedOrigins.has(origin)) {
    warnedOrigins.add(origin);
    console.warn(`CORS blocked request from ${origin}. Add it to CLIENT_URL (currently: ${CLIENT_ORIGINS.join(', ')})`);
  }
  return cb(null, false);
};

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true },
});
// Controllers emit real-time events through req.app.get('io')
app.set('io', io);

app.set('trust proxy', 1); // behind the hosting provider's HTTPS proxy
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => res.json({ name: 'TeamCollab API', health: '/api/health' }));
app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);

app.use(notFound);
app.use(errorHandler);

registerSocketHandlers(io);

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`TeamCollab server listening on port ${PORT}`);
      console.log(`Allowed frontend origins (CLIENT_URL): ${CLIENT_ORIGINS.join(', ')}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    console.error(
      'Check MONGO_URI on your host, and in MongoDB Atlas > Network Access allow 0.0.0.0/0 ' +
        '(hosting providers use changing IP addresses, so a single whitelisted IP blocks the deployed server).'
    );
    process.exit(1);
  });
