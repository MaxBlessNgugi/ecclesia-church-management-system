import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.js';
import christiansRoutes from './routes/christians.js';
import activitiesRoutes from './routes/activities.js';
import deathsRoutes from './routes/deaths.js';
import financeRoutes from './routes/finance.js';
import ledgersRoutes from './routes/ledgers.js';
import inventoryRoutes from './routes/inventory.js';
import hrRoutes from './routes/hr.js';
import adminRoutes from './routes/admin.js';
import reportsRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Mount routes to match API.md contract exactly
app.use('/api/auth', authRoutes);
app.use('/api/christians', christiansRoutes);
app.use('/api', activitiesRoutes); // /api/contributions, /api/transfers, /api/billed-items
app.use('/api/deaths', deathsRoutes);
app.use('/api', financeRoutes); // /api/deposits, /api/creditors, ...
app.use('/api/ledgers', ledgersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n  Ecclesia Backend running on http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
});
