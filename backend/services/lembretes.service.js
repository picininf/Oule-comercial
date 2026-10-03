import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { formatarMoeda, hojeBrasil } from '../utils/financeUtils.js';
import { proximosVencimentos } from './pagamentos.service.js';
import { enviarMensagemParaUsuario, whatsappConectado } from './whatsapp.service.js';

/**
 * Robô de lembretes de vencimento (cartão "Lembretes de vencimento dos
 * pagamentos").
 *
 * Uma vez por hora verifica, a partir das 9h (horário de Brasília), as
 * contas de quem ativou lembretes e manda pelo WhatsApp vinculado:
 *   - "antecedencia": X dias antes (X configurável no cadastro, padrão 3);
 *   - "no_dia": no dia do vencimento;
 *   - "atrasado": no dia seguinte ao vencimento, se não foi marcada paga.
 * A tabela `lembretes_enviados` garante que cada aviso sai uma única vez,
 * mesmo com o servidor reiniciando ou rodando em mais de uma instância.
 *
 * No app, os mesmos vencimentos aparecem como aviso na Visão Geral e na
 * aba Pagamentos — o WhatsApp é um canal extra.
 */

const INTERVALO_MS = 60 * 60 * 1000;
const HORA_INICIO = 9;
let timer = null;
let rodando = false;

function horaBrasil() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(new Date()));
}

function tipoDoAviso(conta, antecedencia) {
  if (conta.diasParaVencer === -1) return 'atrasado';
  if (conta.diasParaVencer === 0) return 'no_dia';
  if (conta.diasParaVencer === antecedencia && antecedencia > 0) return 'antecedencia';
  return null;
}

function textoDoAviso(conta, tipo) {
  const valor = formatarMoeda(conta.valor);
  const data = conta.vencimento.split('-').reverse().join('/');
  if (tipo === 'atrasado') return `🔴 *Conta em atraso*\n\n${conta.descricao} (${valor}) venceu ontem, ${data}. Se já pagou, marque como paga no app.`;
  if (tipo === 'no_dia') return `🟠 *Vence hoje*\n\n${conta.descricao} — ${valor}.`;
  return `🟡 *Lembrete de vencimento*\n\n${conta.descricao} — ${valor} vence em ${conta.diasParaVencer} dias (${data}).`;
}

export async function processarLembretes() {
  if (rodando || !whatsappConectado()) return { enviados: 0 };
  if (horaBrasil() < HORA_INICIO) return { enviados: 0 };
  rodando = true;
  let enviados = 0;

  try {
    const { data: comContas, error } = await supabaseAdmin
      .from('pagamentos_recorrentes')
      .select('user_id')
      .eq('ativo', true)
      .eq('lembrar', true);
    if (error) throw error;
    const usuarios = [...new Set((comContas || []).map((c) => c.user_id))];
    if (usuarios.length === 0) return { enviados: 0 };

    const { data: perfis } = await supabaseAdmin
      .from('profiles')
      .select('id, lembrete_whatsapp, lembrete_dias_antecedencia')
      .in('id', usuarios);

    for (const perfil of perfis || []) {
      if (perfil.lembrete_whatsapp === false) continue;
      const antecedencia = perfil.lembrete_dias_antecedencia ?? 3;
      const contas = await proximosVencimentos(perfil.id, { dias: antecedencia, antecedencia });

      for (const conta of contas) {
        if (!conta.lembrar) continue;
        const tipo = tipoDoAviso(conta, antecedencia);
        if (!tipo) continue;

        // Reserva o aviso ANTES de enviar: se outra instância já reservou,
        // o unique (pagamento, mês, canal, tipo) impede o envio duplicado.
        const { error: erroReserva } = await supabaseAdmin
          .from('lembretes_enviados')
          .insert({ pagamento_id: conta.id, mes: conta.mes, canal: 'whatsapp', tipo });
        if (erroReserva) continue;

        const ok = await enviarMensagemParaUsuario(perfil.id, textoDoAviso(conta, tipo));
        if (ok) enviados += 1;
        else {
          // Não enviou (sem número vinculado / bot caiu): libera para tentar de novo depois.
          await supabaseAdmin
            .from('lembretes_enviados')
            .delete()
            .eq('pagamento_id', conta.id)
            .eq('mes', conta.mes)
            .eq('canal', 'whatsapp')
            .eq('tipo', tipo);
        }
      }
    }
    if (enviados > 0) console.log(`🔔 ${enviados} lembrete(s) de vencimento enviados (${hojeBrasil()}).`);
  } catch (err) {
    console.error('❌ Erro no robô de lembretes:', err.message);
  } finally {
    rodando = false;
  }
  return { enviados };
}

export function iniciarAgendadorLembretes() {
  if (timer || process.env.LEMBRETES_DESATIVADOS === 'true') return;
  // Primeira checagem alguns minutos depois de subir (dá tempo do WhatsApp conectar).
  setTimeout(() => processarLembretes(), 3 * 60 * 1000).unref();
  timer = setInterval(() => processarLembretes(), INTERVALO_MS);
  timer.unref();
}

export function pararAgendadorLembretes() {
  clearInterval(timer);
  timer = null;
}
