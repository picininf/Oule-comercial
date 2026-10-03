import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { analisarComprovante } from './gemini.service.js';
import { categoriaInfo, tipoGastoPadrao, normalizarCategoria } from '../utils/categorias.js';
import { formatarMoeda, hojeBrasil, mesDe, somarMeses, getValorAjustado, ehTransferencia } from '../utils/financeUtils.js';
import { aplicarRegras } from './regras.service.js';
import { proximosVencimentos } from './pagamentos.service.js';

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

  const comando = captionText.toLowerCase();

  if (comando.startsWith('!vincular')) {
    await tratarVinculacao(sock, from, cleanId, altCleanId, altJid, captionText);
    return;
  }

  const [nomeComando, ...argumentos] = comando.split(/\s+/);
  if (['!ajuda', '!contas', '!resumo'].includes(nomeComando)) {
    await tratarConsulta(sock, nomeComando, from, [cleanId, from, altCleanId, altJid], argumentos.join(' '));
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
    .insert({ user_id: vinculo.user_id, telefone: telefoneParaSalvar, jid: from });

  if (insertErr) {
    console.error('❌ Erro ao vincular:', insertErr.message);
    await sock.sendMessage(from, { text: '❌ Erro ao vincular número. Tente novamente mais tarde.' });
    return;
  }

  // Código é de uso único: apaga assim que consumido.
  await supabaseAdmin.from('vinculos_pendentes').delete().eq('codigo', codigo);

  await sock.sendMessage(from, {
    text: '✅ *WhatsApp vinculado com sucesso!*\n\nAgora você pode enviar a foto dos seus comprovantes com a legenda *!imagem*.\n\nOutros comandos: *!contas* (vencimentos), *!resumo* (seu mês) e *!ajuda*.',
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
    // Comprovante enviado pelo cliente é pagamento a alguém. "Transferências"
    // é só para dinheiro entre contas da própria pessoa — se a IA marcar
    // assim um Pix para terceiros, o gasto sumiria dos totais e do !resumo.
    const categoria = dados.categoria === 'Transferências'
      ? normalizarCategoria(null, dados.estabelecimento, -Math.abs(dados.valor))
      : dados.categoria;
    const ehReceita = categoriaInfo(categoria).grupo === 'receita';
    const valorFinal = ehReceita ? Math.abs(dados.valor) : -Math.abs(dados.valor);

    const [linha] = await aplicarRegras(targetUserId, [
      {
        user_id: targetUserId,
        descricao: dados.estabelecimento,
        valor: valorFinal,
        metodo_pagamento: dados.metodo_pagamento,
        categoria,
        data_transacao: dados.data,
        image_url: `/uploads/${filename}`,
        tipo: ehReceita ? 'receita' : 'despesa',
        tipo_gasto: ehReceita ? null : tipoGastoPadrao(categoria),
        data_competencia: dados.data,
        data_caixa: dados.data,
        origem: 'whatsapp',
      },
    ]);
    const { error: dbError } = await supabaseAdmin.from('transacoes').insert([linha]);

    if (dbError) {
      console.error('❌ Erro ao gravar transação:', dbError.message);
      await sock.sendMessage(from, { text: '⚠️ Comprovante lido, mas houve um erro ao salvar. Tente novamente.' });
      return;
    }

    await sock.sendMessage(from, {
      text: `✅ *Comprovante processado!*\n\n🏢 *Local:* ${linha.descricao}\n💰 *Valor:* ${formatarMoeda(Math.abs(valorFinal))}\n📂 *Categoria:* ${linha.categoria}` +
        (linha.regra_id ? '\n📌 _Classificado pela sua regra._' : '') +
        '\n\n_Lançamento gravado no painel._',
    });
  } catch (err) {
    console.error('❌ Erro no processamento do comprovante:', err.message);
    await sock.sendMessage(from, { text: '❌ Não foi possível ler o comprovante agora. Tente novamente.' });
  }
}

/* -------------------------------------------------------------------------
   CONSULTAS PELO WHATSAPP (!contas, !resumo, !ajuda)
   ------------------------------------------------------------------------- */

async function usuarioDoRemetente(ids) {
  const { data } = await supabaseAdmin
    .from('usuarios_whatsapp')
    .select('user_id')
    .in('telefone', [...new Set(ids.filter(Boolean))])
    .limit(1);
  return data?.[0]?.user_id || null;
}

const ROTULO_STATUS = {
  atrasado: '🔴 atrasada',
  vence_hoje: '🟠 vence HOJE',
  vence_em_breve: '🟡 vence em breve',
  pendente: '⚪ a vencer',
};

async function tratarConsulta(sock, comando, from, ids, argumento = '') {
  if (comando === '!ajuda') {
    await sock.sendMessage(from, {
      text:
        '🤖 *Comandos do assistente Oule*\n\n' +
        '📷 *!imagem* — envie a foto do comprovante com esta legenda\n' +
        '🧾 *!contas* — contas a vencer nos próximos dias\n' +
        '📊 *!resumo* — entradas e saídas do mês (*!resumo anterior* ou *!resumo 09/2026* para outro mês)\n' +
        '🔗 *!vincular CODIGO* — vincula este número à sua conta',
    });
    return;
  }

  const userId = await usuarioDoRemetente(ids);
  if (!userId) {
    await sock.sendMessage(from, { text: '⚠️ Número não vinculado. Gere um código no app e envie *!vincular CODIGO*.' });
    return;
  }

  if (comando === '!contas') {
    const contas = await proximosVencimentos(userId, { dias: 10 });
    const texto = contas.length === 0
      ? '✅ Nenhuma conta pendente para os próximos 10 dias.'
      : '🧾 *Suas próximas contas*\n\n' +
        contas
          .slice(0, 15)
          .map((c) => `• ${c.descricao} — ${formatarMoeda(c.valor)} — ${c.vencimento.split('-').reverse().join('/')} (${ROTULO_STATUS[c.status] || c.status})`)
          .join('\n');
    await sock.sendMessage(from, { text: texto });
    return;
  }

  if (comando === '!resumo') {
    const mesHoje = mesDe(hojeBrasil());
    const pedido = mesDoArgumento(argumento, mesHoje);
    if (!pedido) {
      await sock.sendMessage(from, { text: '⚠️ Não entendi o mês. Exemplos: *!resumo*, *!resumo anterior* ou *!resumo 09/2026*.' });
      return;
    }

    let mes = pedido;
    let resumo = await resumoDoMes(userId, mes);
    let aviso = '';
    // Começo de mês costuma estar vazio: em vez de responder "tudo zero",
    // mostra o último mês com movimento (e avisa).
    if (!argumento && resumo.lancamentos === 0) {
      const ultimo = await ultimoMesComMovimento(userId, mes);
      if (ultimo) {
        aviso = `_Ainda não há lançamentos em ${rotuloMes(mes)}. Mostrando ${rotuloMes(ultimo)}._\n\n`;
        mes = ultimo;
        resumo = await resumoDoMes(userId, mes);
      }
    }

    const top = Object.entries(resumo.porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const texto = resumo.lancamentos === 0
      ? `📊 *Resumo de ${rotuloMes(mes)}*\n\nNenhum lançamento neste mês ainda.`
      : `📊 *Resumo de ${rotuloMes(mes)}*\n\n${aviso}` +
        `📥 Entradas: ${formatarMoeda(resumo.entradas)}\n📤 Saídas: ${formatarMoeda(resumo.saidas)}\n💰 Saldo: ${formatarMoeda(resumo.entradas - resumo.saidas)}` +
        (top.length ? `\n\n*Maiores gastos:*\n${top.map(([c, v]) => `${categoriaInfo(c).icone} ${c}: ${formatarMoeda(v)}`).join('\n')}` : '') +
        `\n\n🧾 ${resumo.lancamentos} lançamento(s)` +
        (resumo.transferencias ? ` · ${resumo.transferencias} transferência(s) entre contas não entram na conta` : '') +
        `\n_Outro mês? Envie *!resumo anterior* ou *!resumo MM/AAAA*._`;
    await sock.sendMessage(from, { text: texto });
  }
}

function rotuloMes(mes) {
  return mes.split('-').reverse().join('/');
}

/** "" -> mês atual; "anterior"/"passado" -> mês passado; "9", "09/2026", "2026-09" -> esse mês. */
function mesDoArgumento(argumento, mesHoje) {
  const a = String(argumento || '').trim();
  if (!a) return mesHoje;
  if (/^(anterior|passado|ultimo|último)$/.test(a)) return somarMeses(mesHoje, -1);
  let m = a.match(/^(\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
  if (m) {
    const mesNum = Number(m[1]);
    if (mesNum < 1 || mesNum > 12) return null;
    let ano = m[2] ? Number(m[2].length === 2 ? `20${m[2]}` : m[2]) : Number(mesHoje.slice(0, 4));
    // "!resumo 11" em outubro = novembro do ano passado (não do futuro).
    if (!m[2] && `${ano}-${String(mesNum).padStart(2, '0')}` > mesHoje) ano -= 1;
    return `${ano}-${String(mesNum).padStart(2, '0')}`;
  }
  m = a.match(/^(\d{4})-(\d{1,2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`;
  return null;
}

async function resumoDoMes(userId, mes) {
  const { data, error } = await supabaseAdmin
    .from('transacoes')
    .select('valor, categoria, descricao, origem, open_finance_id')
    .eq('user_id', userId)
    .gte('data_competencia', `${mes}-01`)
    .lt('data_competencia', `${somarMeses(mes, 1)}-01`);
  if (error) throw error;

  const r = { entradas: 0, saidas: 0, porCategoria: {}, lancamentos: (data || []).length, transferencias: 0 };
  for (const t of data || []) {
    if (ehTransferencia(t)) {
      r.transferencias += 1;
      continue;
    }
    const v = getValorAjustado(t);
    if (v > 0) r.entradas += v;
    else if (v < 0) {
      r.saidas += -v;
      const cat = t.categoria || 'Outros';
      r.porCategoria[cat] = (r.porCategoria[cat] || 0) + -v;
    }
  }
  return r;
}

async function ultimoMesComMovimento(userId, antesDe) {
  const { data, error } = await supabaseAdmin
    .from('transacoes')
    .select('data_competencia')
    .eq('user_id', userId)
    .lt('data_competencia', `${antesDe}-01`)
    .neq('categoria', 'Transferências')
    .order('data_competencia', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.data_competencia ? mesDe(data[0].data_competencia) : null;
}

/* -------------------------------------------------------------------------
   ENVIO ATIVO (lembretes de vencimento)
   ------------------------------------------------------------------------- */

export function whatsappConectado() {
  return estado.status === 'conectado' && Boolean(sock);
}

/**
 * Envia uma mensagem para o WhatsApp vinculado a um usuário. Devolve
 * false (sem lançar erro) quando o bot está offline ou a pessoa não
 * vinculou um número — o lembrete simplesmente não é enviado.
 */
export async function enviarMensagemParaUsuario(userId, texto) {
  if (!whatsappConectado()) return false;
  const { data } = await supabaseAdmin
    .from('usuarios_whatsapp')
    .select('telefone, jid')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return false;

  const destino = data.jid || (/^\d{8,15}$/.test(data.telefone || '') ? `${data.telefone}@s.whatsapp.net` : null);
  if (!destino) return false;

  try {
    await sock.sendMessage(destino, { text: texto });
    return true;
  } catch (err) {
    console.error('❌ Falha ao enviar lembrete pelo WhatsApp:', err.message);
    return false;
  }
}
