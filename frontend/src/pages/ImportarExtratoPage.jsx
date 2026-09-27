import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchApi, uploadApi } from '../lib/api';

const DIAS_DO_MES = Array.from({ length: 31 }, (_, i) => i + 1);

const STATUS_LABEL = {
  concluido: { texto: 'Concluída', cor: '#10b981' },
  erro: { texto: 'Erro', cor: '#ef4444' },
  vazio: { texto: 'Sem lançamentos', cor: '#f59e0b' },
};

const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const TAMANHO_MAX_MB = 12;

/**
 * @param {string|null} userId - se null, opera sobre o próprio usuário
 *   logado. Se informado, staff (planejador/oule) vendo/importando o
 *   extrato de um cliente específico — mesmo padrão de ObjetivosPage.
 * @param {boolean} editavel - permite enviar arquivos e alterar o dia
 *   do lembrete. Sempre true na prática (tanto cliente quanto staff
 *   podem operar esta tela), mas mantido por simetria com as outras
 *   páginas do painel.
 * @param {Function} onImportado - chamado depois de uma importação bem
 *   sucedida, para o componente pai recarregar a lista de transações.
 */
export default function ImportarExtratoPage({ userId = null, editavel = true, onImportado }) {
  const [diaImportacao, setDiaImportacao] = useState('');
  const [carregandoConfig, setCarregandoConfig] = useState(true);
  const [salvandoDia, setSalvandoDia] = useState(false);
  const [mensagemDia, setMensagemDia] = useState('');

  const [historico, setHistorico] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);

  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);
  const [arrastandoSobre, setArrastandoSobre] = useState(false);
  const inputRef = useRef(null);

  const qsUserId = userId ? `?userId=${userId}` : '';

  const carregarConfig = useCallback(async () => {
    setCarregandoConfig(true);
    try {
      const data = await fetchApi(`/extrato/config${qsUserId}`);
      setDiaImportacao(data.diaImportacao ? String(data.diaImportacao) : '');
    } catch (err) {
      // Não bloqueia a tela por causa disso — o upload continua funcionando.
      console.error('Erro ao carregar dia de importação:', err.message);
    } finally {
      setCarregandoConfig(false);
    }
  }, [qsUserId]);

  const carregarHistorico = useCallback(async () => {
    setCarregandoHistorico(true);
    try {
      const data = await fetchApi(`/extrato/importacoes${qsUserId}`);
      setHistorico(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar histórico de importações:', err.message);
    } finally {
      setCarregandoHistorico(false);
    }
  }, [qsUserId]);

  useEffect(() => { carregarConfig(); }, [carregarConfig]);
  useEffect(() => { carregarHistorico(); }, [carregarHistorico]);

  const salvarDia = async (valor) => {
    setDiaImportacao(valor);
    setSalvandoDia(true);
    setMensagemDia('');
    try {
      await fetchApi('/extrato/config', {
        method: 'PUT',
        body: JSON.stringify({ diaImportacao: valor ? Number(valor) : null, ...(userId ? { userId } : {}) }),
      });
      setMensagemDia('Lembrete salvo!');
      setTimeout(() => setMensagemDia(''), 2500);
    } catch (err) {
      setMensagemDia(err.message || 'Erro ao salvar o dia do lembrete.');
    } finally {
      setSalvandoDia(false);
    }
  };

  const validarEDefinirArquivo = (file) => {
    setErro('');
    setResultado(null);
    if (!file) return;
    if (!TIPOS_ACEITOS.includes(file.type)) {
      setErro('Formato não suportado. Envie um PDF ou uma foto/print nítida do extrato (JPG, PNG ou WEBP).');
      return;
    }
    if (file.size > TAMANHO_MAX_MB * 1024 * 1024) {
      setErro(`Arquivo muito grande. O limite é ${TAMANHO_MAX_MB}MB.`);
      return;
    }
    setArquivo(file);
  };

  const enviarExtrato = async () => {
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    setResultado(null);
    try {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      if (userId) formData.append('userId', userId);

      const data = await uploadApi('/extrato/importar', formData);
      setResultado(data);
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = '';
      await carregarHistorico();
      if (onImportado) await onImportado();
    } catch (err) {
      setErro(err.message || 'Não foi possível importar este extrato.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <div className="table-card" style={{ padding: '32px', marginBottom: '20px' }}>
        <div className="open-finance-hero" style={{ textAlign: 'center' }}>
          <span className="of-icon">📄</span>
          <h2>Importar Extrato Manualmente</h2>
          <p style={{ maxWidth: '560px', margin: '12px auto 4px auto', color: '#64748b' }}>
            Não quer (ou não pode) conectar o banco pelo Open Finance? Envie o PDF do extrato ou uma foto legível
            todo mês e a IA lança as transações automaticamente no seu painel — sem duplicar o que já foi importado.
          </p>
        </div>

        {editavel && (
          <>
            {erro && <div className="auth-alert error" style={{ marginTop: '20px' }}>{erro}</div>}

            {resultado && (
              <div style={{ marginTop: '20px', padding: '14px 16px', background: '#d1fae5', color: '#065f46', borderRadius: '8px', fontSize: '14px' }}>
                ✅ <strong>{resultado.count}</strong> {resultado.count === 1 ? 'transação nova importada' : 'transações novas importadas'}.
                {resultado.duplicadas > 0 && ` ${resultado.duplicadas} já existiam e foram ignoradas.`}
              </div>
            )}

            <div
              className={`extrato-dropzone ${arrastandoSobre ? 'arrastando' : ''}`}
              style={{ marginTop: '24px' }}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastandoSobre(true); }}
              onDragLeave={() => setArrastandoSobre(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastandoSobre(false);
                validarEDefinirArquivo(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                style={{ display: 'none' }}
                onChange={(e) => validarEDefinirArquivo(e.target.files?.[0])}
              />
              {arquivo ? (
                <>
                  <span style={{ fontSize: '32px' }}>📎</span>
                  <p style={{ fontWeight: 600, margin: '8px 0 2px 0' }}>{arquivo.name}</p>
                  <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{(arquivo.size / 1024 / 1024).toFixed(2)} MB — clique para trocar</p>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '32px' }}>⬆️</span>
                  <p style={{ fontWeight: 600, margin: '8px 0 2px 0' }}>Arraste o extrato aqui ou clique para escolher</p>
                  <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>PDF, JPG, PNG ou WEBP — até {TAMANHO_MAX_MB}MB</p>
                </>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '18px' }}>
              <button
                type="button"
                className="btn-bank"
                style={{ padding: '14px 28px', fontSize: '16px' }}
                disabled={!arquivo || enviando}
                onClick={enviarExtrato}
              >
                {enviando ? '⏳ Lendo extrato com IA...' : '🚀 Importar Extrato'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="table-card" style={{ padding: '32px', marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '8px' }}>🗓️ Lembrete mensal</h3>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>
          Escolha (ou combine com seu planejador) o dia do mês em que o extrato costuma fechar, para lembrar de
          enviar sempre na mesma data.
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="select-filter"
            style={{ padding: '10px', minWidth: '160px' }}
            value={diaImportacao}
            disabled={carregandoConfig || salvandoDia}
            onChange={(e) => salvarDia(e.target.value)}
          >
            <option value="">Sem lembrete definido</option>
            {DIAS_DO_MES.map((dia) => (
              <option key={dia} value={dia}>Todo dia {dia}</option>
            ))}
          </select>
          {salvandoDia && <span style={{ color: '#64748b', fontSize: '13px' }}>Salvando...</span>}
          {mensagemDia && <span style={{ color: '#10b981', fontSize: '13px' }}>{mensagemDia}</span>}
        </div>
      </div>

      <div className="table-card">
        <div className="card-header-flex" style={{ marginBottom: '16px' }}>
          <h3>📜 Histórico de Importações</h3>
          <span className="badge-count">{historico.length}</span>
        </div>

        {carregandoHistorico ? (
          <div className="empty-state-box"><p>Carregando histórico...</p></div>
        ) : historico.length === 0 ? (
          <div className="empty-state-box"><p>Nenhum extrato importado ainda.</p></div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Data</th>
                <th>Novas transações</th>
                <th>Duplicadas ignoradas</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id}>
                  <td>{h.nomeArquivo}</td>
                  <td>{new Date(h.createdAt).toLocaleString('pt-BR')}</td>
                  <td className="center-text">{h.quantidadeTransacoes}</td>
                  <td className="center-text">{h.quantidadeDuplicadas}</td>
                  <td>
                    <span style={{ color: STATUS_LABEL[h.status]?.cor || '#64748b', fontWeight: 600 }}>
                      {STATUS_LABEL[h.status]?.texto || h.status}
                    </span>
                    {h.mensagemErro && <div style={{ fontSize: '12px', color: '#94a3b8' }}>{h.mensagemErro}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
