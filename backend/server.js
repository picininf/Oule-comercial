import 'dotenv/config';
import { validarAmbiente, IS_PRODUCTION } from './config/env.js';

validarAmbiente();

const { default: express } = await import('express');
const { default: helmet } = await import('helmet');
const { corsMiddleware } = await import('./middleware/cors.js');
const { apiLimiter } = await import('./middleware/rateLimit.js');
const { errorHandler, notFoundHandler, requestId } = await import('./middleware/errorHandler.js');

const rotas = {
  transacoes: (await import('./routes/transacoes.routes.js')).default,
  openFinance: (await import('./routes/openFinance.routes.js')).default,
  whatsapp: (await import('./routes/whatsapp.routes.js')).default,
  uploads: (await import('./routes/uploads.routes.js')).default,
  webhooks: (await import('./routes/webhook.routes.js')).default,
  admin: (await import('./routes/admin.routes.js')).default,
  auth: (await import('./routes/auth.routes.js')).default,
  objetivos: (await import('./routes/objetivos.routes.js')).default,
  plano: (await import('./routes/plano.routes.js')).default,
  planejadores: (await import('./routes/planejadores.routes.js')).default,
  extrato: (await import('./routes/extrato.routes.js')).default,
  perfil: (await import('./routes/perfil.routes.js')).default,
  cartoes: (await import('./routes/cartoes.routes.js')).default,
  pagamentos: (await import('./routes/pagamentos.routes.js')).default,
  analises: (await import('./routes/analises.routes.js')).default,
};

const { conectarWhatsApp } = await import('./services/whatsapp.service.js');
const { iniciarAgendadorLembretes, pararAgendadorLembretes } = await import('./services/lembretes.service.js');

const app = express();

// Necessário para que o IP real do cliente (rate limit, logs) seja lido
// corretamente atrás de proxy (Render, ngrok, Nginx).
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestId);
app.use(
  helmet({
    // API pura (JSON): nenhuma página HTML é servida daqui.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use('/api/', apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/transacoes', rotas.transacoes);
app.use('/api/open-finance', rotas.openFinance);
app.use('/api/whatsapp', rotas.whatsapp);
app.use('/api/uploads', rotas.uploads);
app.use('/api/webhooks', rotas.webhooks);
app.use('/api/auth', rotas.auth);
app.use('/api/perfil', rotas.perfil);
app.use('/api/objetivos', rotas.objetivos);
app.use('/api/extrato', rotas.extrato);
app.use('/api/plano', rotas.plano);
app.use('/api/cartoes', rotas.cartoes);
app.use('/api/pagamentos', rotas.pagamentos);
app.use('/api/analises', rotas.analises);
app.use('/api/admin/planejadores', rotas.planejadores);
app.use('/api/admin', rotas.admin);

app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.WHATSAPP_DESATIVADO !== 'true') {
  conectarWhatsApp().catch((err) => console.error('❌ Falha ao iniciar o WhatsApp:', err.message));
  iniciarAgendadorLembretes();
}

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log('--------------------------------------------------');
  console.log(`🚀 Servidor rodando na porta: ${PORT} (${IS_PRODUCTION ? 'produção' : 'desenvolvimento'})`);
  console.log('--------------------------------------------------');
});

// Desligamento limpo (deploy/restart no Render): termina as requisições
// em andamento antes de sair.
function encerrar(sinal) {
  console.log(`\n${sinal} recebido. Encerrando com segurança...`);
  pararAgendadorLembretes();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
process.on('unhandledRejection', (motivo) => console.error('❌ Promise rejeitada sem tratamento:', motivo));
