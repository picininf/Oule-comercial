import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchApi } from '../lib/api';
 
const ROTULOS_STATUS = {
  iniciando: { texto: 'Iniciando serviço...', tom: 'neutro' },
  conectando: { texto: 'Conectando ao WhatsApp...', tom: 'neutro' },
  aguardando_qr: { texto: 'Aguardando leitura do QR Code', tom: 'atencao' },
  conectado: { texto: 'Bot conectado', tom: 'ok' },
  desconectado: { texto: 'Bot desconectado', tom: 'erro' },
  erro: { texto: 'Falha na conexão', tom: 'erro' },
};
 
function segundosRestantes(qrExpiraEm) {
  if (!qrExpiraEm) return 0;
  return Math.max(0, Math.round((new Date(qrExpiraEm).getTime() - Date.now()) / 1000));
}
 
/**
 * Painel de conexão do bot. Só o administrador enxerga o QR Code — ele é
 * uma credencial: quem escaneia passa a controlar a conta de WhatsApp do
 * robô. O backend também recusa a rota para contas comuns (403), então
 * esconder aqui é só conforto de interface, não a proteção em si.
 */
function PainelConexaoBot() {
  const [estado, setEstado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [acaoEmCurso, setAcaoEmCurso] = useState(null);
  const [erro, setErro] = useState(null);
  const [restante, setRestante] = useState(0);
  const montado = useRef(true);
 
  const carregarStatus = useCallback(async () => {
    try {
      const data = await fetchApi('/whatsapp/status');
      if (!montado.current) return;
      setEstado(data);
      setRestante(segundosRestantes(data.qrExpiraEm));
      setErro(null);
    } catch (err) {
      if (!montado.current) return;
      setErro(err.message);
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, []);
 
  // Polling adaptativo: rápido enquanto esperamos o scan, lento quando já
  // está tudo conectado — evita martelar a API (e o rate limit) à toa.
  useEffect(() => {
    montado.current = true;
    carregarStatus();
 
    const intervalo = setInterval(carregarStatus, estado?.status === 'conectado' ? 20000 : 4000);
    return () => {
      montado.current = false;
      clearInterval(intervalo);
    };
  }, [carregarStatus, estado?.status]);
 
  // Contador regressivo de validade do QR (o WhatsApp troca o código a cada ~1 min).
  useEffect(() => {
    if (!estado?.qrExpiraEm) return undefined;
    const tick = setInterval(() => setRestante(segundosRestantes(estado.qrExpiraEm)), 1000);
    return () => clearInterval(tick);
  }, [estado?.qrExpiraEm]);
 
  const executar = async (rota, label) => {
    setAcaoEmCurso(label);
    setErro(null);
    try {
      const data = await fetchApi(rota, { method: 'POST' });
      setEstado(data);
      setRestante(segundosRestantes(data.qrExpiraEm));
    } catch (err) {
      setErro(err.message);
    } finally {
      setAcaoEmCurso(null);
    }
  };
 
  if (carregando) {
    return (
      <div className="qr-panel">
        <div className="qr-skeleton" />
        <p className="qr-hint">Consultando o status do bot...</p>
      </div>
    );
  }
 
  const status = estado?.status || 'erro';
  const rotulo = ROTULOS_STATUS[status] || ROTULOS_STATUS.erro;
  const conectado = status === 'conectado';
 
  return (
    <div className="qr-panel">
      <div className="qr-panel-header">
        <h4>Conexão do robô</h4>
        <span className={`status-pill status-${rotulo.tom}`}>
          <span className="status-dot" aria-hidden="true" />
          {rotulo.texto}
        </span>
      </div>
 
      {conectado ? (
        <div className="qr-connected">
          <div className="qr-connected-icon" aria-hidden="true">✅</div>
          <p>
            O bot está online{estado.numero ? <> no número <strong>+{estado.numero}</strong></> : null}.
            Não é preciso escanear nada.
          </p>
        </div>
      ) : (
        <div className="qr-stage">
          {estado?.qr ? (
            <>
              <img className="qr-image" src={estado.qr} alt="QR Code para conectar o WhatsApp do bot" />
              <p className="qr-timer" role="status">
                {restante > 0
                  ? <>Este código expira em <strong>{restante}s</strong> — um novo aparece sozinho.</>
                  : 'Código expirado. Gerando um novo...'}
              </p>
            </>
          ) : (
            <div className="qr-placeholder">
              <div className="qr-spinner" aria-hidden="true" />
              <p>{status === 'desconectado' ? 'Clique em "Gerar novo QR Code" para começar.' : 'Gerando QR Code...'}</p>
            </div>
          )}
        </div>
      )}
 
      <ol className="qr-steps">
        <li>Abra o WhatsApp no celular do robô.</li>
        <li>Toque em <strong>Configurações → Dispositivos conectados</strong>.</li>
        <li>Escolha <strong>Conectar um dispositivo</strong> e aponte para o código acima.</li>
      </ol>
 
      {estado?.ultimoErro && <p className="qr-alert">{estado.ultimoErro}</p>}
      {erro && <p className="qr-alert">{erro}</p>}
 
      <div className="qr-actions">
        <button
          className="btn-secondary"
          disabled={Boolean(acaoEmCurso)}
          onClick={() => executar('/whatsapp/reconectar', 'reconectar')}
        >
          {acaoEmCurso === 'reconectar' ? 'Gerando...' : '🔄 Gerar novo QR Code'}
        </button>
        <button
          className="btn-danger-outline"
          disabled={Boolean(acaoEmCurso)}
          onClick={() => {
            const ok = window.confirm(
              'Isso desconecta o número atual e apaga a sessão salva no servidor. Um QR Code novo será gerado. Continuar?',
            );
            if (ok) executar('/whatsapp/desconectar', 'desconectar');
          }}
        >
          {acaoEmCurso === 'desconectar' ? 'Desconectando...' : '🚪 Desconectar número'}
        </button>
      </div>
 
      <p className="qr-hint">
        Nunca compartilhe print deste QR Code: quem escaneia ganha acesso total às conversas do robô.
      </p>
    </div>
  );
}
 
export default function WhatsappBotPage({ isAdmin = false }) {
  const [whatsappCodigo, setWhatsappCodigo] = useState(null);
  const [expiraEmMinutos, setExpiraEmMinutos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [copiado, setCopiado] = useState(false);
 
  const gerarCodigo = async () => {
    setLoading(true);
    setErro(null);
    setCopiado(false);
    try {
      // userId nunca é enviado pelo frontend — o backend identifica o
      // usuário através do token de sessão.
      const data = await fetchApi('/whatsapp/vincular', { method: 'POST' });
      setWhatsappCodigo(data.codigo);
      setExpiraEmMinutos(data.expiraEmMinutos);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  };
 
  const copiarComando = async () => {
    try {
      await navigator.clipboard.writeText(`!vincular ${whatsappCodigo}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar automaticamente. Selecione e copie o comando na mão.');
    }
  };
 
  return (
    <div className="table-card whatsapp-page">
      <header className="whatsapp-page-header">
        <h2>🤖 Assistente IA de WhatsApp</h2>
        <p>Envie comprovantes de pagamento no chat para o robô registrar tudo automaticamente.</p>
      </header>
 
      {isAdmin ? (
        <PainelConexaoBot />
      ) : (
        <div className="qr-panel qr-panel-bloqueado">
          <div className="qr-panel-header">
            <h4>Conexão do robô</h4>
            <span className="status-pill status-neutro">
              <span className="status-dot" aria-hidden="true" />
              Restrito ao administrador
            </span>
          </div>
          <p className="qr-hint">
            O QR Code que conecta o número do robô ao WhatsApp é uma credencial:
            quem escaneia passa a ler e enviar mensagens em nome dele. Por isso
            ele só aparece para a conta de administrador — entre com ela para
            conectar o bot. Aqui você vincula apenas o <strong>seu</strong> número,
            usando o código abaixo.
          </p>
        </div>
      )}
 
      <div className="whatsapp-grid-setup">
        <section className="setup-box">
          <h4>Vincular aparelho</h4>
          <p>Gere um código exclusivo para sincronizar seu número de WhatsApp ao sistema.</p>
          <button className="btn-primary" disabled={loading} onClick={gerarCodigo}>
            {loading ? 'Gerando...' : '🔑 Gerar código de vínculo'}
          </button>
 
          {erro && <p className="qr-alert">{erro}</p>}
 
          {whatsappCodigo && (
            <div className="code-display-box">
              <span>Código de vínculo</span>
              <div className="code-number">{whatsappCodigo}</div>
              <p>
                Envie no WhatsApp: <code>!vincular {whatsappCodigo}</code>
              </p>
              <button className="btn-ghost" onClick={copiarComando}>
                {copiado ? '✅ Comando copiado' : '📋 Copiar comando'}
              </button>
              <small>Expira em {expiraEmMinutos} minutos e só pode ser usado uma vez.</small>
            </div>
          )}
        </section>
 
        <section className="setup-box-instructions">
          <h4>Como funciona?</h4>
          <ul>
            <li>📷 Envie uma foto ou print do recibo/comprovante.</li>
            <li>💬 Adicione a legenda com o comando <code>!imagem</code>.</li>
            <li>🧠 A IA lê o valor e salva direto no seu dashboard.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}