import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';

import { corsMiddleware } from './middleware/cors.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import transacoesRoutes from './routes/transacoes.routes.js';
import openFinanceRoutes from './routes/openFinance.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import uploadsRoutes from './routes/uploads.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import objetivosRoutes from './routes/objetivos.routes.js';
import planoRoutes from './routes/plano.routes.js';
import planejadoresRoutes from './routes/planejadores.routes.js';

import { conectarWhatsApp } from './services/whatsapp.service.js';

const app = express();

// Necessário para que req.headers['x-forwarded-for'] reflita o IP real
// do cliente quando o app roda atrás de um proxy (ngrok, Nginx, etc).
app.set('trust proxy', 1);

app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use('/api/', apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/transacoes', transacoesRoutes);
app.use('/api/open-finance', openFinanceRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/objetivos', objetivosRoutes);
app.use('/api/plano', planoRoutes);
app.use('/api/admin/planejadores', planejadoresRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

conectarWhatsApp();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('--------------------------------------------------');
  console.log(`🚀 Servidor rodando na porta: ${PORT}`);
  console.log('--------------------------------------------------');
});
