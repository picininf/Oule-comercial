import React, { useState } from 'react';
import { Card, Campo, Alerta, useToast } from '../components/ui';
import { api, getApiUrl, setApiUrlOverride, getDefaultApiUrl, testarConexaoApi } from '../lib/api';
import { exportarExcel, exportarJSON } from '../lib/exportar';
import { getValorAjustado, origemDe } from '../lib/finance';
import { TIPO_GASTO_POR_ID } from '../lib/categorias';

/**
 * Configurações: tema, exportação completa dos dados e (avançado) a URL
 * do servidor. Removidos: "moeda" (só trocava o símbolo R$ por $ sem
 * converter valor nenhum — enganoso) e "teto de gastos" (não era usado).
 */
export default function ConfiguracoesPage({ tema, setTema, ehStaff = false }) {
  const toast = useToast();
  const [exportando, setExportando] = useState(false);
  const [avancadoAberto, setAvancadoAberto] = useState(false);
  const [apiUrl, setApiUrl] = useState(() => getApiUrl());
  const [statusConexao, setStatusConexao] = useState(null);
  const [testando, setTestando] = useState(false);

  const exportarTudo = async (formato) => {
    setExportando(true);
    try {
      const [transacoes, objetivos, pagamentos, perfil] = await Promise.all([
        api.get('/transacoes?limite=5000'),
        api.get('/objetivos'),
        api.get('/pagamentos').catch(() => []),
        api.get('/perfil').catch(() => null),
      ]);

      if (formato === 'json') {
        await exportarJSON({ nome: 'oule-meus-dados', dados: { exportadoEm: new Date().toISOString(), perfil, transacoes, objetivos, pagamentos } });
      } else {
        await exportarExcel({
          nome: 'oule-meus-dados',
          abas: [
            {
              nome: 'Transações',
              colunas: [
                { titulo: 'Data da compra', tipo: 'data', valor: (t) => t.data_competencia || t.data_transacao },
                { titulo: 'Data do pagamento', tipo: 'data', valor: (t) => t.data_caixa || t.data_transacao },
                { titulo: 'Descrição', largura: 36, chave: 'descricao' },
                { titulo: 'Categoria', largura: 18, chave: 'categoria' },
                { titulo: 'Tipo de gasto', largura: 26, valor: (t) => TIPO_GASTO_POR_ID[t.tipo_gasto]?.nome || '' },
                { titulo: 'Origem', valor: (t) => origemDe(t).nome },
                { titulo: 'Valor', tipo: 'moeda', valor: (t) => getValorAjustado(t) },
              ],
              linhas: transacoes || [],
            },
            {
              nome: 'Sonhos',
              colunas: [
                { titulo: 'Sonho', largura: 30, chave: 'titulo' },
                { titulo: 'Valor alvo', tipo: 'moeda', chave: 'valorAlvo' },
                { titulo: 'Guardado', tipo: 'moeda', chave: 'valorAtual' },
                { titulo: 'Prazo', tipo: 'data', chave: 'prazo' },
                { titulo: 'Situação', chave: 'status' },
              ],
              linhas: objetivos || [],
            },
            {
              nome: 'Contas mensais',
              colunas: [
                { titulo: 'Conta', largura: 28, chave: 'descricao' },
                { titulo: 'Categoria', chave: 'categoria' },
                { titulo: 'Valor', tipo: 'moeda', chave: 'valor' },
                { titulo: 'Vencimento (dia)', chave: 'diaVencimento' },
              ],
              linhas: pagamentos || [],
            },
          ],
        });
      }
      toast('Exportação concluída.');
    } catch (err) {
      toast(err.message || 'Falha ao exportar.', 'erro');
    } finally {
      setExportando(false);
    }
  };

  const salvarUrl = () => {
    try {
      setApiUrlOverride(apiUrl);
      setStatusConexao(null);
      toast('Endereço do servidor salvo.');
    } catch (err) {
      setStatusConexao({ ok: false, texto: err.message });
    }
  };

  const testar = async () => {
    setTestando(true);
    setStatusConexao(null);
    try {
      await testarConexaoApi(apiUrl.trim());
      setStatusConexao({ ok: true, texto: 'Conectado! O servidor respondeu normalmente.' });
    } catch (err) {
      setStatusConexao({ ok: false, texto: `Falha ao conectar: ${err.message}` });
    } finally {
      setTestando(false);
    }
  };

  return (
    <div className="pilha" style={{ maxWidth: 820 }}>
      <Card titulo="Aparência" icone="🎨">
        <Campo rotulo="Tema">
          <div className="segmentado" role="group" aria-label="Tema">
            {[
              { id: 'claro', nome: '☀️ Claro' },
              { id: 'noturno', nome: '🌙 Noturno' },
              { id: 'sistema', nome: '💻 Seguir o sistema' },
            ].map((t) => (
              <button key={t.id} type="button" className={tema === t.id ? 'ativo' : ''} onClick={() => setTema(t.id)}>{t.nome}</button>
            ))}
          </div>
        </Campo>
      </Card>

      {!ehStaff && (
        <Card titulo="Meus dados" icone="📦">
          <p className="texto-suave" style={{ marginBottom: 14 }}>
            Baixe uma cópia completa: transações, sonhos e contas mensais. Para relatórios de uma tela específica, use o botão “Exportar” de cada página (CSV, Excel, PDF ou imagem).
          </p>
          <div className="linha">
            <button type="button" className="btn btn-primario" disabled={exportando} onClick={() => exportarTudo('xlsx')}>{exportando ? 'Gerando...' : '📊 Exportar tudo (Excel)'}</button>
            <button type="button" className="btn btn-secundario" disabled={exportando} onClick={() => exportarTudo('json')}>🗄️ Backup completo (JSON)</button>
          </div>
        </Card>
      )}

      <Card titulo="Segurança e privacidade" icone="🔒">
        <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }} className="texto-suave">
          <li>Seus dados financeiros ficam no servidor, protegidos por login; nada sensível fica salvo no aparelho.</li>
          <li>O app nunca recebe sua senha do banco (o Open Finance usa o ambiente seguro da Pluggy, só leitura).</li>
          <li>Extratos enviados são lidos em memória e descartados — só os lançamentos ficam salvos.</li>
          <li>Comparativos com outras pessoas são anônimos e só aparecem para grupos de 5 pessoas ou mais.</li>
        </ul>
      </Card>

      <Card titulo="Avançado" icone="🛠️" acoes={<button type="button" className="btn btn-fantasma btn-pequeno" onClick={() => setAvancadoAberto((v) => !v)}>{avancadoAberto ? 'Ocultar' : 'Mostrar'}</button>}>
        {avancadoAberto ? (
          <div className="pilha">
            <Campo rotulo="Endereço do servidor (API)" ajuda={`Só altere se a equipe pedir. Padrão: ${getDefaultApiUrl() || 'não definido'}`}>
              <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://servidor.exemplo.com/api" />
            </Campo>
            {statusConexao && <Alerta tipo={statusConexao.ok ? 'sucesso' : 'erro'}>{statusConexao.texto}</Alerta>}
            <div className="linha">
              <button type="button" className="btn btn-primario" onClick={salvarUrl}>Salvar</button>
              <button type="button" className="btn btn-secundario" onClick={testar} disabled={testando}>{testando ? 'Testando...' : 'Testar conexão'}</button>
              <button type="button" className="btn btn-fantasma" onClick={() => { setApiUrlOverride(''); setApiUrl(getDefaultApiUrl()); setStatusConexao(null); }}>Restaurar padrão</button>
            </div>
          </div>
        ) : (
          <p className="texto-suave texto-pequeno">Configurações técnicas de conexão com o servidor.</p>
        )}
      </Card>
    </div>
  );
}
