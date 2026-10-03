import React, { useRef, useState } from 'react';
import { Card, Campo, Alerta, Vazio, Carregando, useToast } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { api, uploadApi } from '../lib/api';
import { qs } from '../lib/format';

const DIAS_DO_MES = Array.from({ length: 31 }, (_, i) => i + 1);
const STATUS = {
  concluido: { texto: 'Concluída', classe: 'tag-sucesso' },
  erro: { texto: 'Erro', classe: 'tag-perigo' },
  vazio: { texto: 'Sem lançamentos', classe: 'tag-atencao' },
};
const EXTENSOES = ['csv', 'xls', 'xlsx', 'ofx', 'pdf', 'jpg', 'jpeg', 'png', 'webp'];
const TAMANHO_MAX_MB = 12;
const METODO = {
  planilha: 'lido direto da planilha (sem IA)',
  ia_texto: 'layout diferente — lido com IA',
  ia: 'lido com IA',
};

/**
 * Importação manual de extrato/fatura: alternativa ao Open Finance.
 * Planilhas (CSV/XLS/XLSX) e OFX são lidas direto, sem IA; PDF e foto
 * passam pela IA. Escolhendo um cartão, o arquivo é tratado como fatura
 * e cada compra vai para a data de pagamento certa.
 */
export default function ImportarExtratoPage({ userId = null, onImportado }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [arquivo, setArquivo] = useState(null);
  const [cartaoId, setCartaoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);
  const [arrastando, setArrastando] = useState(false);

  const { dados: config, setDados: setConfig } = useApi(`/extrato/config${qs({ userId })}`);
  const { dados: historico, carregando: carregandoHistorico, recarregar: recarregarHistorico } = useApi(`/extrato/importacoes${qs({ userId })}`);
  const { dados: cartoes } = useApi(`/cartoes${qs({ userId })}`);

  const escolher = (file) => {
    setErro('');
    setResultado(null);
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (!EXTENSOES.includes(ext)) {
      setErro('Formato não suportado. Envie CSV, XLS, XLSX ou OFX exportado do banco — ou PDF/foto nítida.');
      return;
    }
    if (file.size > TAMANHO_MAX_MB * 1024 * 1024) {
      setErro(`Arquivo muito grande. O limite é ${TAMANHO_MAX_MB}MB.`);
      return;
    }
    setArquivo(file);
  };

  const enviar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      if (userId) fd.append('userId', userId);
      if (cartaoId) fd.append('cartaoId', cartaoId);
      const data = await uploadApi('/extrato/importar', fd);
      setResultado(data);
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = '';
      toast(`${data.count} ${data.count === 1 ? 'lançamento importado' : 'lançamentos importados'}.`);
      recarregarHistorico();
      onImportado?.();
    } catch (err) {
      setErro(err.message);
      recarregarHistorico();
    } finally {
      setEnviando(false);
    }
  };

  const salvarDia = async (valor) => {
    try {
      const r = await api.put('/extrato/config', { diaImportacao: valor ? Number(valor) : null, ...(userId ? { userId } : {}) });
      setConfig(r);
      toast(valor ? `Lembrete definido para todo dia ${valor}.` : 'Lembrete removido.');
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const ehImagemOuPdf = arquivo && /\.(pdf|jpe?g|png|webp)$/i.test(arquivo.name);

  return (
    <div className="pilha">
      <Card titulo="Importar extrato ou fatura" icone="📄">
        <p className="texto-suave" style={{ marginBottom: 16 }}>
          Não quer (ou não pode) conectar o banco pelo Open Finance? Exporte o extrato no app ou site do banco e envie aqui.
          <strong> CSV, Excel (XLS/XLSX) e OFX</strong> são lidos na hora, sem IA. <strong>PDF e foto</strong> também funcionam, lidos pela IA.
          Lançamentos repetidos são ignorados automaticamente.
        </p>

        <div
          className={`dropzone ${arrastando ? 'arrastando' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]); }}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".csv,.xls,.xlsx,.ofx,.pdf,.jpg,.jpeg,.png,.webp,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/*"
            onChange={(e) => escolher(e.target.files?.[0])}
          />
          <span style={{ fontSize: 30 }} aria-hidden="true">{arquivo ? '📎' : '⬆️'}</span>
          {arquivo ? (
            <>
              <strong>{arquivo.name}</strong>
              <span className="texto-suave texto-pequeno">{(arquivo.size / 1024 / 1024).toFixed(2)} MB — clique para trocar</span>
            </>
          ) : (
            <>
              <strong>Arraste o arquivo aqui ou clique para escolher</strong>
              <span className="texto-suave texto-pequeno">Até {TAMANHO_MAX_MB}MB</span>
            </>
          )}
          <div className="formatos">
            {['CSV', 'XLS', 'XLSX', 'OFX', 'PDF', 'Foto'].map((f) => <span key={f} className="tag">{f}</span>)}
          </div>
        </div>

        <div className="grade-form" style={{ marginTop: 16 }}>
          <Campo rotulo="Este arquivo é…" ajuda="Escolhendo um cartão, cada compra é colocada na data de pagamento da fatura certa.">
            <select className="input" value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
              <option value="">Extrato da conta corrente / poupança</option>
              {(cartoes || []).map((c) => <option key={c.id} value={c.id}>Fatura do cartão {c.nome}</option>)}
            </select>
          </Campo>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn btn-primario btn-bloco" disabled={!arquivo || enviando} onClick={enviar}>
              {enviando ? (ehImagemOuPdf ? '⏳ Lendo com IA...' : '⏳ Importando...') : '🚀 Importar'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 16 }} className="pilha">
          <Alerta>{erro}</Alerta>
          {resultado && (
            <Alerta tipo="sucesso">
              ✅ <strong>{resultado.count}</strong> {resultado.count === 1 ? 'lançamento novo' : 'lançamentos novos'}
              {resultado.duplicadas > 0 && ` · ${resultado.duplicadas} já existiam e foram ignorados`}
              {resultado.metodo && ` · ${METODO[resultado.metodo]}`}
              {resultado.cartao && ` · fatura do ${resultado.cartao}`}.
            </Alerta>
          )}
        </div>
      </Card>

      <Card titulo="Como exportar do seu banco" icone="❓">
        <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li><strong>Nubank:</strong> app → cartão ou conta → “Exportar fatura/extrato” → CSV.</li>
          <li><strong>Itaú, Bradesco, Santander, BB, Caixa:</strong> internet banking → Extrato → “Salvar como” Excel, OFX ou PDF.</li>
          <li><strong>Inter, C6 e outros:</strong> extrato → exportar em PDF ou planilha.</li>
          <li>Prefira <strong>OFX ou planilha</strong>: é mais rápido e mais preciso do que PDF ou foto.</li>
        </ul>
      </Card>

      <Card titulo="Lembrete mensal" icone="🗓️">
        <p className="texto-suave" style={{ marginBottom: 12 }}>Combine com seu planejador o dia do mês para enviar o extrato.</p>
        <select className="input" style={{ maxWidth: 260 }} value={config?.diaImportacao || ''} onChange={(e) => salvarDia(e.target.value)} aria-label="Dia do lembrete">
          <option value="">Sem lembrete</option>
          {DIAS_DO_MES.map((d) => <option key={d} value={d}>Todo dia {d}</option>)}
        </select>
      </Card>

      <Card titulo="Histórico de importações" icone="📜" semPadding>
        {carregandoHistorico && !historico ? <Carregando /> : !historico || historico.length === 0 ? (
          <Vazio icone="📜" texto="Nenhum arquivo importado ainda." />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr><th>Arquivo</th><th>Data</th><th className="num">Novos</th><th className="num">Repetidos</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td style={{ maxWidth: 280 }}>{h.nomeArquivo}</td>
                    <td>{new Date(h.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="num">{h.quantidadeTransacoes}</td>
                    <td className="num">{h.quantidadeDuplicadas}</td>
                    <td>
                      <span className={`tag ${STATUS[h.status]?.classe || ''}`}>{STATUS[h.status]?.texto || h.status}</span>
                      {h.mensagemErro && <div className="texto-suave texto-pequeno">{h.mensagemErro}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
