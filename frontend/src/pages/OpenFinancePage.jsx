import { useState } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import { fetchApi } from '../lib/api';
import React from 'react';
export default function OpenFinancePage({ onSincronizado }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectToken, setConnectToken] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  const handleOpenBankConnect = async () => {
    setConnectToken(null);
    setIsModalOpen(true);
    setTokenLoading(true);
    try {
      const data = await fetchApi('/open-finance/token');
      setConnectToken(data.connectToken);
    } catch (err) {
      alert(`Erro ao conectar: ${err.message}`);
      setIsModalOpen(false);
    } finally {
      setTokenLoading(false);
    }
  };

  const handlePluggySuccess = async (itemData) => {
    const itemId = typeof itemData.item === 'object' ? itemData.item?.id : (itemData.item || itemData.itemId);
    if (!itemId) {
      alert('Erro ao obter ID da conexão bancária.');
      setIsModalOpen(false);
      return;
    }
    try {
      // O backend valida o usuário pelo token de sessão (nunca por um
      // userId enviado no corpo da requisição).
      const result = await fetchApi(`/open-finance/transacoes/${itemId}`, { method: 'POST' });
      if (result.success && result.count > 0) {
        alert(`🎉 Sucesso! ${result.count} novas transações sincronizadas!`);
        await onSincronizado();
      } else {
        alert('Conexão criada! As transações chegarão automaticamente via webhook assim que o banco processar.');
      }
    } catch (err) {
      alert(`Erro na sincronização: ${err.message}`);
    } finally {
      setIsModalOpen(false);
    }
  };

  return (
    <>
      <div className="table-card" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="open-finance-hero">
          <span className="of-icon">🏦</span>
          <h2>Central Open Finance</h2>
          <p style={{ maxWidth: '500px', margin: '12px auto 24px auto', color: '#64748b' }}>
            Conecte suas contas bancárias para extrair dados oficiais via protocolo regulamentado pelo Banco Central.
            Depois da conexão inicial, novas transações chegam automaticamente — sem precisar reabrir o app.
          </p>
          <button className="btn-bank" onClick={handleOpenBankConnect} style={{ padding: '14px 28px', fontSize: '16px' }}>
            ⚡ Conectar Instituição Financeira
          </button>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Conectar Open Finance</h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {tokenLoading ? (
                <p className="center-text">Carregando ambiente seguro...</p>
              ) : connectToken ? (
                <PluggyConnect
                  connectToken={connectToken}
                  includeSandbox={import.meta.env.MODE !== 'production'}
                  onSuccess={handlePluggySuccess}
                  onError={(err) => console.error(err)}
                  onClose={() => setIsModalOpen(false)}
                />
              ) : (
                <p className="center-text">Falha ao obter token de conexão.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
