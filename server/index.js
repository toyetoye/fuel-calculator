const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/voyages', require('./routes/voyageRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/ref', require('./routes/refRoutes'));
app.use('/api/lng-vessels', require('./routes/vesselRoutes'));
app.use('/api/fuel-prices', require('./routes/priceRoutes'));
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api/import', require('./routes/importRoutes'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'fuel-calculator' }));

const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));

initDB().then(() => app.listen(PORT, () => console.log(`Fuel Calculator running on port ${PORT}`))).catch(err => { console.error(err); process.exit(1); });
