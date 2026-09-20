import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { analisarComprovante, calcularValorPelaCategoria } from './gemini.service.js';

const uploadsFolder = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsFolder)) fs.mkdirSync(uploadsFolder, { recursive: true });

const AUTH_FOLDER = path.join(process.cwd(), process.env.WHATSAPP_AUTH_DIR || 'auth_info_baileys');

// Um QR do WhatsApp vive ~60s. Guardamos o horário de expiração para o
// painel saber quando pedir um novo em vez de mostrar um código morto.
const QR_TTL_MS = 60 * 1000;

// Anti-força-bruta em memória para o comando !vincular.
const tentativasVinculo = new Map(); // chave: remetente -> { count, resetAt }
const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 10 * 60 * 1000;

function bloqueadoPorRateLimit(remetente) {
  const agora = Date.now();
  const registro = tentativasVinculo.get(remetente);
  if (!registro || agora > registro.resetAt) {
    tentativasVinculo.set(remetente, { count: 1, resetAt: agora + JANELA_MS });
    return false;
  }
  registro.count += 1;
  return registro.count > LIMITE_TENTATIVAS;
}

/* -------------------------------------------------------------------------
   ESTADO DA CONEXÃO (fonte de verdade para o painel web)

   O QR Code é uma CREDENCIAL: quem escaneia passa a controlar a conta de
   WhatsApp do bot. Por isso ele só vive na memória do processo (nunca em
   banco, nunca em arquivo, nunca em log) e só é devolvido pela rota
   protegida /api/whatsapp/status, que exige token válido + e-mail de admin.
   ------------------------------------------------------------------------- */
const estado = {
  status: 'iniciando', // iniciando | aguardando_qr | conectando | conectado | desconectado | erro
  qr: null, // data URL (image/png) — apagada assim que a conexão abre
  qrExpiraEm: null, // ISO string
  numero: null, // número conectado, só para exibição
  conectadoDesde: null,
  ultimoErro: null,
  atualizadoEm: new Date().toISOString(),
};

let sock = null;
let iniciando = false;
let reconnectTimer = null;

function atualizarEstado(patch) {
  Object.assign(estado, patch, { atualizadoEm: new Date().toISOString() });
}

/** Snapshot seguro do estado, consumido pela rota /api/whatsapp/status. */
export function getWhatsappEstado() {
  // Se o QR já passou da validade, não devolve lixo para a tela.
  const expirado = estado.qrExpiraEm && new Date(estado.qrExpiraEm).getTime() < Date.now();
  return {
    status: estado.status,
    qr: expirado ? null : estado.qr,
    qrExpiraEm: expirado ? null : estado.qrExpiraEm,
    qrExpirado: Boolean(expirado && estado.status === 'aguardando_qr'),
    numero: estado.numero,
    conectadoDesde: estado.conectadoDesde,
    ultimoErro: estado.ultimoErro,
    atualizadoEm: estado.atualizadoEm,
  };
}

function limparSessaoLocal() {
  try {
    if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
  } catch (err) {
    console.error('⚠️ Não foi possível apagar a sessão local do WhatsApp:', err.message);
  }
}

function agendarReconexao(ms = 5000) {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    conectarWhatsApp().catch((err) => {
      console.error('❌ Falha ao reconectar WhatsApp:', err.message);
      atualizarEstado({ status: 'erro', ultimoErro: 'Falha ao reconectar.' });
    });
  }, ms);
}

/**
 * Abre (ou reabre) a conexão com o WhatsApp.
 * É idempotente: chamadas concorrentes não criam dois sockets.
 */
export async function conectarWhatsApp() {
  if (iniciando) return;
  iniciando = true;
  clearTimeout(reconnectTimer);

  try {
    // Derruba um socket anterior antes de abrir outro, senão os listeners
    // antigos continuam vivos e as mensagens são processadas em duplicidade.
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end(undefined);
      } catch {
        /* socket já estava morto */
      }
      sock = null;
    }

    atualizarEstado({ status: 'conectando', ultimoErro: null });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    sock = makeWASocket({
      auth: state,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          // Data URL em PNG: o painel só precisa jogar num <img src={qr} />,
          // sem depender de nenhuma biblioteca de QR no frontend.
          const dataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 320,
            color: { dark: '#0f172a', light: '#ffffff' },
          });

          atualizarEstado({
            status: 'aguardando_qr',
            qr: dataUrl,
            qrExpiraEm: new Date(Date.now() + QR_TTL_MS).toISOString(),
            numero: null,
            conectadoDesde: null,
          });

          // Mantém também o QR no log do Render, como fallback.
          console.log('\n📱 Novo QR Code gerado. Escaneie pelo painel (aba WhatsApp Bot) ou aqui:\n');
          qrcodeTerminal.generate(qr, { small: true });
        } catch (err) {
          console.error('❌ Erro ao renderizar o QR Code:', err.message);
          atualizarEstado({ status: 'erro', ultimoErro: 'Não foi possível gerar a imagem do QR Code.' });
        }
      }

      if (connection === 'open') {
        atualizarEstado({
          status: 'conectado',
          qr: null,
          qrExpiraEm: null,
          numero: (sock?.user?.id || '').split(':')[0] || null,
          conectadoDesde: new Date().toISOString(),
          ultimoErro: null,
        });
        console.log('✅ WhatsApp conectado e operacional!');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const deslogado = statusCode === DisconnectReason.loggedOut;
        const precisaReiniciar = statusCode === DisconnectReason.restartRequired;

        atualizarEstado({
          status: 'desconectado',
          qr: null,
          qrExpiraEm: null,
          numero: null,
          conectadoDesde: null,
          ultimoErro: deslogado
            ? 'A sessão foi encerrada no celular. Gere um novo QR Code para reconectar.'
            : null,
        });

        if (deslogado) {
          // Credencial revogada: apagar os arquivos é obrigatório, senão o
          // Baileys fica em loop tentando usar uma sessão que não existe mais.
          console.log('🔴 WhatsApp deslogado. Limpando sessão local.');
          limparSessaoLocal();
          agendarReconexao(2000); // reconecta já pedindo QR novo
          return;
        }

        console.log(`🔴 Conexão WhatsApp fechada (code ${statusCode}). Reconectando...`);
        agendarReconexao(precisaReiniciar ? 1000 : 5000);
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      try {
        await processarMensagem(sock, m);
      } catch (err) {
        console.error('❌ Erro ao processar mensagem do WhatsApp:', err);
      }
    });
  } finally {
    iniciando = false;
  }
}

/**
 * Força a geração de um QR Code novo.
 * Com `limparSessao: true` a credencial salva em disco é apagada — é o que
 * se usa para trocar o número do bot ou depois de um vazamento de sessão.
 */
export async function reiniciarWhatsApp({ limparSessao = false } = {}) {
  if (limparSessao) {
    try {
      await sock?.logout();
    } catch {
      /* se já estava fora, seguimos para a limpeza mesmo assim */
    }
    limparSessaoLocal();
  }

  atualizarEstado({ status: 'conectando', qr: null, qrExpiraEm: null, numero: null, conectadoDesde: null });
  await conectarWhatsApp();
  return getWhatsappEstado();
}

async function processarMensagem(sock, m) {
  const msg = m.messages[0];
  if (!msg || !msg.message) return;

  const from = msg.key.remoteJid;
  if (!from || from.endsWith('@newsletter')) return;

  let msgContent = msg.message;
  if (msgContent.ephemeralMessage) msgContent = msgContent.ephemeralMessage.message;
  if (msgContent.viewOnceMessage) msgContent = msgContent.viewOnceMessage.message;
  if (msgContent.viewOnceMessageV2) msgContent = msgContent.viewOnceMessageV2.message;
  if (msgContent.documentWithCaptionMessage) msgContent = msgContent.documentWithCaptionMessage.message;

  const isImage = msgContent.imageMessage;
  const isDocument = msgContent.documentMessage;

  const captionText = (
    isImage?.caption ||
    isDocument?.caption ||
    msgContent.conversation ||
    msgContent.extendedTextMessage?.text ||
    ''
  ).trim();

  const cleanId = from.split(':')[0].replace('@s.whatsapp.net', '').replace('@lid', '').trim();
  const altJid = msg.key.remoteJidAlt;
  const altCleanId = altJid ? altJid.split(':')[0].replace('@s.whatsapp.net', '').replace('@lid', '').trim() : null;

  if (captionText.toLowerCase().startsWith('!vincular')) {
    await tratarVinculacao(sock, from, cleanId, altCleanId, altJid, captionText);
    return;
  }

  if ((isImage || isDocument) && captionText.toLowerCase() === '!imagem') {
    await tratarComprovante(sock, msg, from, cleanId, altCleanId, altJid);
    return;
  }

  if (!isImage && !isDocument && captionText.toLowerCase() === '!imagem') {
    await sock.sendMessage(from, { text: '🤖 Para cadastrar um comprovante, envie a *FOTO* da nota/recibo com a legenda *!imagem*.' });
  }
}

async function tratarVinculacao(sock, from, cleanId, altCleanId, altJid, captionText) {
  if (bloqueadoPorRateLimit(from)) {
    await sock.sendMessage(from, { text: '⚠️ Muitas tentativas de vinculação. Aguarde alguns minutos e tente novamente.' });
    return;
  }

  const codigo = captionText.split(' ')[1]?.trim();
  if (!codigo || !/^\d{6}$/.test(codigo)) {
    await sock.sendMessage(from, { text: '⚠️ Envie o comando no formato: *!vincular CODIGO* (6 dígitos).' });
    return;
  }

  const { data: vinculo, error } = await supabaseAdmin
    .from('vinculos_pendentes')
    .select('user_id, expira_em')
    .eq('codigo', codigo)
    .maybeSingle();

  const expirado = vinculo?.expira_em && new Date(vinculo.expira_em).getTime() < Date.now();

  if (error || !vinculo || expirado) {
    await sock.sendMessage(from, { text: '❌ Código inválido ou expirado. Gere um novo código no painel.' });
    return;
  }

  const telefoneParaSalvar = cleanId || from;

  // Remove qualquer registro existente para este usuário ou para este telefone antes de inserir
  await supabaseAdmin.from('usuarios_whatsapp').delete().eq('user_id', vinculo.user_id);
  await supabaseAdmin.from('usuarios_whatsapp').delete().eq('telefone', telefoneParaSalvar);

  // Insere um registro único e limpo garantindo que não quebre a constraint de user_id
  const { error: insertErr } = await supabaseAdmin
    .from('usuarios_whatsapp')
    .insert({ user_id: vinculo.user_id, telefone: telefoneParaSalvar });

  if (insertErr) {
    console.error('❌ Erro ao vincular:', insertErr.message);
    await sock.sendMessage(from, { text: '❌ Erro ao vincular número. Tente novamente mais tarde.' });
    return;
  }

  // Código é de uso único: apaga assim que consumido.
  await supabaseAdmin.from('vinculos_pendentes').delete().eq('codigo', codigo);

  await sock.sendMessage(from, {
    text: '✅ *WhatsApp vinculado com sucesso!*\n\nAgora você pode enviar a foto dos seus comprovantes com a legenda *!imagem*.',
  });
}

async function tratarComprovante(sock, msg, from, cleanId, altCleanId, altJid) {
  const idsToSearch = [...new Set([cleanId, from, altCleanId, altJid].filter(Boolean))];

  const { data: usuariosEncontrados } = await supabaseAdmin
    .from('usuarios_whatsapp')
    .select('user_id')
    .in('telefone', idsToSearch)
    .limit(1);

  const targetUserId = usuariosEncontrados?.[0]?.user_id;
  if (!targetUserId) {
    await sock.sendMessage(from, {
      text: '⚠️ *Número não vinculado!*\n\nAcesse seu painel, gere um novo código e envie `!vincular CODIGO` novamente.',
    });
    return;
  }

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });

    const filename = `${crypto.randomUUID()}.jpg`;
    fs.writeFileSync(path.join(uploadsFolder, filename), buffer);

    const dados = await analisarComprovante(buffer, 'image/jpeg');
    const valorFinal = calcularValorPelaCategoria(dados.categoria, dados.valor);

    const { error: dbError } = await supabaseAdmin.from('transacoes').insert([
      {
        user_id: targetUserId,
        descricao: dados.estabelecimento,
        valor: valorFinal,
        metodo_pagamento: dados.metodo_pagamento,
        categoria: dados.categoria,
        data_transacao: dados.data,
        image_url: `/uploads/${filename}`,
        tipo: 'despesa',
      },
    ]);

    if (dbError) {
      console.error('❌ Erro ao gravar transação:', dbError.message);
      await sock.sendMessage(from, { text: '⚠️ Comprovante lido, mas houve um erro ao salvar. Tente novamente.' });
      return;
    }

    await sock.sendMessage(from, {
      text: `✅ *Comprovante processado!*\n\n🏢 *Local:* ${dados.estabelecimento}\n💰 *Valor:* R$ ${Math.abs(valorFinal).toFixed(2)}\n📂 *Categoria:* ${dados.categoria}\n\n_Lançamento gravado no painel._`,
    });
  } catch (err) {
    console.error('❌ Erro no processamento do comprovante:', err.message);
    await sock.sendMessage(from, { text: '❌ Não foi possível ler o comprovante agora. Tente novamente.' });
  }
}
