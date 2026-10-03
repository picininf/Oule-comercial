import React, { useState } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import { Card, Modal, Alerta, Vazio, Carregando, useToast, useConfirmacao } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatarData } from '../lib/format';

const STATUS = {
  UPDATED: { texto: 'Atualizado', classe: 'tag-sucesso' },
  UPDATING: { texto: 'Atualizando...', classe: 'tag-bank' },
  OUTDATED: { texto: 'Desatualizado', classe: 'tag-atencao' },
  LOGIN_ERROR: { texto: 'Senha do banco mudou', classe: 'tag-perigo' },
  WAITING_USER_INPUT: { texto: 'Aguardando você', classe: 'tag-atencao' },
  ATIVO: { texto: 'Conectado', classe: 'tag-sucesso' },
  ERRO: { texto: 'Erro', classe: 'tag-perigo' },
};

export default function OpenFinancePage({ onSincronizado }) {
  const toast = useToast();
  const [confirmar, modalConfirmacao] = useConfirmacao();
  const { dados: itens, carregando, erro, recarregar } = useApi('/open-finance/items');
  const [connect, setConnect] = useState(null); // { token, includeSandbox, itemId? }
  const [abrindo, setAbrindo] = useState(false);
  const [sincronizando, setSincronizando] = useState(null);

  const abrirConnect = async (itemId) => {
    setAbrindo(true);
    try {
      const data = await api.get(`/open-finance/token${itemId ? `?itemId=${itemId}` : ''}`);
      setConnect({ token: data.connectToken, includeSandbox: data.includeSandbox, itemId });
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setAbrindo(false);
    }
  };

  const concluir = async (itemData) => {
    const itemId = typeof itemData?.item === 'object' ? itemData.item?.id : itemData?.item || itemData?.itemId;
    setConnect(null);
    if (!itemId) {
      toast('Não recebemos a identificação da conexão. Tente novamente.', 'erro');
      return;
    }
    try {
      toast('Conectado! Buscando suas transações...', 'info');
      const r = await api.post(`/open-finance/transacoes/${itemId}`);
      toast(r.novas > 0 ? `${r.novas} transações importadas do banco.` : 'Conexão criada. As transações chegam automaticamente assim que o banco liberar.');
      recarregar();
      onSincronizado?.();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const sincronizar = async (item) => {
    setSincronizando(item.itemId);
    try {
      const r = await api.post(`/open-finance/items/${item.itemId}/sincronizar`);
      toast(r.novas > 0 ? `${r.novas} novas transações.` : 'Tudo em dia — nenhuma transação nova.');
      recarregar();
      onSincronizado?.();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSincronizando(null);
    }
  };

  const desconectar = async (item) => {
    const ok = await confirmar({
      titulo: `Desconectar ${item.banco}`,
      texto: 'O app deixa de receber novas transações deste banco. As transações já importadas continuam no seu extrato.',
      confirmar: 'Desconectar',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/open-finance/items/${item.itemId}`);
      toast('Banco desconectado.');
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  return (
    <div className="pilha">
      {modalConfirmacao}
      <Card titulo="Open Finance" icone="🏦" acoes={<button type="button" className="btn btn-primario" onClick={() => abrirConnect()} disabled={abrindo}>{abrindo ? 'Abrindo...' : '⚡ Conectar instituição'}</button>}>
        <p className="texto-suave">
          Conecte suas contas e cartões pelo protocolo regulamentado pelo Banco Central. Depois da conexão, as novas transações chegam sozinhas —
          e os cartões aparecem em <strong>Cartões & Faturas</strong> com as compras já na fatura certa.
        </p>
        <p className="texto-suave texto-pequeno" style={{ marginTop: 8 }}>🔒 O app nunca vê sua senha do banco: o login acontece no ambiente seguro da Pluggy, e o acesso é só de leitura.</p>
      </Card>

      <Card titulo="Conexões" icone="🔗" semPadding>
        <Alerta>{erro}</Alerta>
        {carregando && !itens ? <Carregando /> : !itens || itens.length === 0 ? (
          <Vazio icone="🏦" titulo="Nenhum banco conectado" texto="Prefere não conectar? Use “Importar Extrato” para enviar o arquivo do banco todo mês." />
        ) : (
          <ul className="lista-contas">
            {itens.map((item) => {
              const st = STATUS[item.status] || { texto: item.status, classe: '' };
              return (
                <li key={item.itemId} className="conta" style={{ gridTemplateColumns: '48px minmax(0,1fr) auto' }}>
                  <div className="conta-dia" style={{ background: 'transparent' }}>
                    {item.logo ? <img src={item.logo} alt="" width="36" height="36" style={{ borderRadius: 8 }} /> : <span style={{ fontSize: 24 }}>🏦</span>}
                  </div>
                  <div className="conta-info">
                    <strong>{item.banco}</strong>
                    <small><span className={`tag ${st.classe}`}>{st.texto}</span> · última atualização {formatarData(String(item.ultimaAtualizacao || '').slice(0, 10))}</small>
                  </div>
                  <div className="conta-acoes" style={{ gridColumn: 'auto' }}>
                    {item.precisaReconectar && <button type="button" className="btn btn-primario btn-pequeno" onClick={() => abrirConnect(item.itemId)}>Reconectar</button>}
                    <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => sincronizar(item)} disabled={sincronizando === item.itemId}>{sincronizando === item.itemId ? 'Atualizando...' : '🔄 Atualizar'}</button>
                    <button type="button" className="btn btn-perigo-contorno btn-pequeno" onClick={() => desconectar(item)}>Desconectar</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {connect && (
        <Modal titulo="Conectar banco" onFechar={() => setConnect(null)} largura="md">
          <div className="modal-corpo-iframe" style={{ margin: '-20px -24px -24px' }}>
            <PluggyConnect
              connectToken={connect.token}
              includeSandbox={connect.includeSandbox}
              updateItem={connect.itemId}
              onSuccess={concluir}
              onError={(e) => {
                console.error(e);
                toast('A conexão com o banco não foi concluída.', 'erro');
              }}
              onClose={() => setConnect(null)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
