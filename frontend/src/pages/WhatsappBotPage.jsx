import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Card, useToast, useConfirmacao } from '../components/ui';

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
 * Painel de conexão do bot — só o administrador vê o QR Code (é uma
 * credencial: quem escaneia controla a conta de WhatsApp do robô). O
 * backend também recusa a rota para outras contas (403).
 */
function PainelConexaoBot() {
  const toast = useToast();
  const [confirmar, modalConfirmacao] = useConfirmacao();
  const [estado, setEstado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [acao, setAcao] = useState(null);
  const [erro, setErro] = useState(null);
  const [restante, setRestante] = useState(0);
  const montado = useRef(true);

  const carregarStatus = useCallback(async () => {
    try {
      const data = await api.get('/whatsapp/status');
      if (!montado.current) return;
      setEstado(data);
      setRestante(segundosRestantes(data.qrExpiraEm));
      setErro(null);
    } catch (err) {
      if (montado.current) setErro(err.message);
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, []);

  // Polling adaptativo: rápido esperando o scan, lento quando conectado.
  useEffect(() => {
    montado.current = true;
    carregarStatus();
    const intervalo = setInterval(carregarStatus, estado?.status === 'conectado' ? 20000 : 4000);
    return () => {
      montado.current = false;
      clearInterval(intervalo);
    };
  }, [carregarStatus, estado?.status]);

  useEffect(() => {
    if (!estado?.qrExpiraEm) return undefined;
    const tick = setInterval(() => setRestante(segundosRestantes(estado.qrExpiraEm)), 1000);
    return () => clearInterval(tick);
  }, [estado?.qrExpiraEm]);

  const executar = async (rota, nome) => {
    setAcao(nome);
    setErro(null);
    try {
      const data = await api.post(rota);
      setEstado(data);
      setRestante(segundosRestantes(data.qrExpiraEm));
    } catch (err) {
      setErro(err.message);
    } finally {
      setAcao(null);
    }
  };

  const desconectar = async () => {
    const ok = await confirmar({
      titulo: 'Desconectar o número do bot',
      texto: 'Isso desconecta o número atual e apaga a sessão salva no servidor. Um QR Code novo será gerado.',
      confirmar: 'Desconectar',
      perigo: true,
    });
    if (ok) {
      await executar('/whatsapp/desconectar', 'desconectar');
      toast('Número desconectado.');
    }
  };

  if (carregando) {
    return <div className="qr-panel"><div className="qr-skeleton" /><p className="qr-hint">Consultando o status do bot...</p></div>;
  }

  const status = estado?.status || 'erro';
  const rotulo = ROTULOS_STATUS[status] || ROTULOS_STATUS.erro;

  return (
    <div className="qr-panel">
      {modalConfirmacao}
      <div className="qr-panel-header">
        <h4>Conexão do robô</h4>
        <span className={`status-pill status-${rotulo.tom}`}><span className="status-dot" aria-hidden="true" />{rotulo.texto}</span>
      </div>

      {status === 'conectado' ? (
        <div className="qr-connected">
          <div className="qr-connected-icon" aria-hidden="true">✅</div>
          <p>O bot está online{estado.numero ? <> no número <strong>+{estado.numero}</strong></> : null}. Lembretes de vencimento estão sendo enviados.</p>
        </div>
      ) : (
        <div className="qr-stage">
          {estado?.qr ? (
            <>
              <img className="qr-image" src={estado.qr} alt="QR Code para conectar o WhatsApp do bot" />
              <p className="qr-timer" role="status">{restante > 0 ? <>Este código expira em <strong>{restante}s</strong> — um novo aparece sozinho.</> : 'Código expirado. Gerando um novo...'}</p>
            </>
          ) : (
            <div className="qr-placeholder">
              <div className="qr-spinner" aria-hidden="true" />
              <p>{status === 'desconectado' ? 'Clique em “Gerar novo QR Code” para começar.' : 'Gerando QR Code...'}</p>
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
        <button type="button" className="btn btn-secundario" disabled={Boolean(acao)} onClick={() => executar('/whatsapp/reconectar', 'reconectar')}>
          {acao === 'reconectar' ? 'Gerando...' : '🔄 Gerar novo QR Code'}
        </button>
        <button type="button" className="btn btn-perigo-contorno" disabled={Boolean(acao)} onClick={desconectar}>
          {acao === 'desconectar' ? 'Desconectando...' : '🚪 Desconectar número'}
        </button>
      </div>
      <p className="qr-hint">Nunca compartilhe print deste QR Code: quem escaneia ganha acesso total às conversas do robô.</p>
    </div>
  );
}

export default function WhatsappBotPage({ isAdmin = false }) {
  const toast = useToast();
  const [codigo, setCodigo] = useState(null);
  const [expira, setExpira] = useState(null);
  const [gerando, setGerando] = useState(false);

  const gerarCodigo = async () => {
    setGerando(true);
    try {
      // O backend identifica o usuário pelo token — nenhum userId é enviado.
      const data = await api.post('/whatsapp/vincular');
      setCodigo(data.codigo);
      setExpira(data.expiraEmMinutos);
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setGerando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`!vincular ${codigo}`);
      toast('Comando copiado.');
    } catch {
      toast('Não foi possível copiar. Selecione o comando e copie manualmente.', 'erro');
    }
  };

  return (
    <div className="pilha">
      {isAdmin && <PainelConexaoBot />}

      <div className="grade-2">
        {!isAdmin && (
          <Card titulo="Vincular meu WhatsApp" icone="🔑">
            <p className="texto-suave" style={{ marginBottom: 14 }}>Gere um código e envie para o número do assistente Oule. Ele vale por poucos minutos e só pode ser usado uma vez.</p>
            <button type="button" className="btn btn-primario" disabled={gerando} onClick={gerarCodigo}>{gerando ? 'Gerando...' : 'Gerar código de vínculo'}</button>
            {codigo && (
              <div className="pilha" style={{ marginTop: 16, gap: 8, alignItems: 'flex-start' }}>
                <span className="texto-suave texto-pequeno">Envie no WhatsApp:</span>
                <span className="codigo-vinculo">!vincular {codigo}</span>
                <button type="button" className="btn btn-secundario btn-pequeno" onClick={copiar}>📋 Copiar comando</button>
                <span className="texto-suave texto-pequeno">Expira em {expira} minutos.</span>
              </div>
            )}
          </Card>
        )}

        <Card titulo="O que o assistente faz" icone="🤖">
          <ul className="comandos">
            <li><code>!imagem</code><span>Envie a <strong>foto do comprovante</strong> com esta legenda: a IA lê e lança no seu extrato.</span></li>
            <li><code>!contas</code><span>Lista as contas que vencem nos próximos dias.</span></li>
            <li><code>!resumo</code><span>Entradas, saídas e maiores gastos do mês.</span></li>
            <li><code>!ajuda</code><span>Mostra todos os comandos.</span></li>
          </ul>
          <p className="texto-suave texto-pequeno" style={{ marginTop: 12 }}>🔔 Com o número vinculado, você também recebe os <strong>lembretes de vencimento</strong> configurados em Pagamentos.</p>
        </Card>
      </div>
    </div>
  );
}
