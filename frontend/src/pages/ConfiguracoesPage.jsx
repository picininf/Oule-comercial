import { useState } from 'react';
import React from 'react';
import { getApiUrl, setApiUrlOverride, getDefaultApiUrl, testarConexaoApi } from '../lib/api';

export default function ConfiguracoesPage({ configs, setConfigs, transacoes }) {
  const [mensagemSucesso, setMensagemSucesso] = useState('');
  const [apiUrl, setApiUrl] = useState(() => getApiUrl());
  const [statusConexao, setStatusConexao] = useState(null); // { ok: bool, texto: string }
  const [testando, setTestando] = useState(false);

  const salvarApiUrl = () => {
    setApiUrlOverride(apiUrl);
    setStatusConexao(null);
    setMensagemSucesso('URL do servidor salva com sucesso!');
    setTimeout(() => setMensagemSucesso(''), 3000);
  };

  const restaurarApiUrlPadrao = () => {
    setApiUrlOverride('');
    setApiUrl(getDefaultApiUrl());
    setStatusConexao(null);
  };

  const testarConexao = async () => {
    setTestando(true);
    setStatusConexao(null);
    try {
      await testarConexaoApi(apiUrl.trim().replace(/\/+$/, ''));
      setStatusConexao({ ok: true, texto: 'Conectado! O servidor respondeu normalmente.' });
    } catch (err) {
      setStatusConexao({ ok: false, texto: `Falha ao conectar: ${err.message}` });
    } finally {
      setTestando(false);
    }
  };

  const exportarBackup = () => {
    const blob = new Blob([JSON.stringify(transacoes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-oule-finance.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="table-card" style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>⚙️ Configurações do Aplicativo</h2>
      <p style={{ margin: '8px 0 24px 0', color: '#64748b' }}>
        Personalize sua experiência de uso e gerencie dados do sistema.
      </p>

      {mensagemSucesso && (
        <div style={{ marginBottom: '16px', padding: '12px', background: '#d1fae5', color: '#065f46', borderRadius: '8px', fontSize: '14px' }}>
          {mensagemSucesso}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMensagemSucesso('Configurações salvas com sucesso!');
          setTimeout(() => setMensagemSucesso(''), 3000);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: '600' }}>Tema do Aplicativo</label>
          <select
            value={configs.tema}
            onChange={(e) => setConfigs({ ...configs, tema: e.target.value })}
            className="select-filter"
            style={{ width: '100%', padding: '10px' }}
          >
            <option value="claro">Claro</option>
            <option value="noturno">Noturno (Dark)</option>
          </select>
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: '600' }}>Meta / Teto de Gastos Mensais</label>
          <input
            type="number"
            min="0"
            value={configs.limiteGastos}
            onChange={(e) => setConfigs({ ...configs, limiteGastos: Number(e.target.value) })}
            className="search-input"
            style={{ width: '100%', padding: '10px' }}
          />
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: '600' }}>Moeda Padrão</label>
          <select
            value={configs.moeda}
            onChange={(e) => setConfigs({ ...configs, moeda: e.target.value })}
            className="select-filter"
            style={{ width: '100%', padding: '10px' }}
          >
            <option value="BRL">Real Brasileiro (R$)</option>
            <option value="USD">Dólar Americano ($)</option>
            <option value="EUR">Euro (€)</option>
          </select>
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
          Salvar Configurações
        </button>
      </form>

      <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
        <h3>Servidor (Backend)</h3>
        <p style={{ margin: '8px 0 16px 0', color: '#64748b', fontSize: '14px' }}>
          Endereço do backend que o app usa para buscar seus dados. Em
          desenvolvimento, O endereço padrão é: "https://oule-comercial-backend.onrender.com/api".
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          <label style={{ fontWeight: '600' }}>URL da API (ex.: https://oule-comercial-backend.onrender.com/api)</label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className="search-input"
            style={{ width: '100%', padding: '10px' }}
            placeholder="https://oule-comercial-backend.onrender.com/api"
          />
        </div>
        {statusConexao && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '14px',
              background: statusConexao.ok ? '#d1fae5' : '#fee2e2',
              color: statusConexao.ok ? '#065f46' : '#991b1b',
            }}
          >
            {statusConexao.texto}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={salvarApiUrl} className="btn-primary">
            Salvar URL
          </button>
          <button type="button" onClick={testarConexao} className="btn-secondary" disabled={testando}>
            {testando ? 'Testando...' : 'Testar conexão'}
          </button>
          <button type="button" onClick={restaurarApiUrlPadrao} className="btn-secondary">
            Restaurar padrão
          </button>
        </div>
      </div>

      <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
        <h3>Gerenciamento de Dados</h3>
        <p style={{ margin: '8px 0 16px 0', color: '#64748b', fontSize: '14px' }}>
          Exporte um backup em JSON das suas transações.
        </p>
        <button type="button" onClick={exportarBackup} className="btn-secondary">
          📥 Exportar Backup (JSON)
        </button>
        {/* Removido: "Zerar Dados Locais". As transações vivem no banco
            (Supabase), não em localStorage — um botão de "limpar" aqui
            passava a falsa impressão de apagar dados que continuavam
            existindo no servidor. Exclusão real de dados deve ser uma
            ação explícita, com confirmação, feita via API autenticada. */}
      </div>
    </div>
  );
}
