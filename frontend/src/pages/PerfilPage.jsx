import React, { useEffect, useState } from 'react';
import { Card, Campo, Alerta, Carregando, Barra, useToast } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { qs } from '../lib/format';

const BANCOS = ['Nubank', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa', 'Inter', 'C6 Bank', 'BTG', 'XP', 'Sicoob', 'Sicredi', 'PicPay', 'Mercado Pago', 'Outro'];

/**
 * Dados de cadastro do cliente + TAGs de perfil (forma de trabalho,
 * país, profissão...) + Código de cliente. A equipe usa a mesma tela
 * para o cadastro de um cliente (com o campo de anotações internas).
 */
export default function PerfilPage({ userId = null, ehStaff = false, onAtualizado }) {
  const toast = useToast();
  const { dados: perfil, carregando, erro, setDados } = useApi(`/perfil${qs({ userId })}`);
  const { dados: opcoes } = useApi('/perfil/opcoes');
  const [form, setForm] = useState(null);
  const [novaTag, setNovaTag] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  useEffect(() => {
    if (!perfil) return;
    setForm({
      nome: perfil.nome,
      telefone: perfil.telefone,
      bancoConectado: perfil.bancoConectado,
      dataNascimento: perfil.dataNascimento || '',
      cidade: perfil.cidade,
      estado: perfil.estado,
      pais: perfil.pais || 'Brasil',
      profissao: perfil.profissao,
      formaTrabalho: perfil.formaTrabalho,
      rendaMensal: perfil.rendaMensal ?? '',
      estadoCivil: perfil.estadoCivil,
      dependentes: perfil.dependentes ?? '',
      tags: perfil.tags || [],
      observacoesPlanejador: perfil.observacoesPlanejador || '',
    });
  }, [perfil]);

  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  const adicionarTag = () => {
    const t = novaTag.trim().slice(0, 30);
    if (t && !form.tags.some((x) => x.toLowerCase() === t.toLowerCase()) && form.tags.length < 20) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setNovaTag('');
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErroSalvar('');
    try {
      const atualizado = await api.put('/perfil', {
        ...form,
        rendaMensal: form.rendaMensal === '' ? null : Number(form.rendaMensal),
        dependentes: form.dependentes === '' ? null : Number(form.dependentes),
        observacoesPlanejador: ehStaff ? form.observacoesPlanejador : undefined,
        ...(userId ? { userId } : {}),
      });
      setDados(atualizado);
      toast('Cadastro salvo.');
      onAtualizado?.();
    } catch (err) {
      setErroSalvar(err.message);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando && !perfil) return <Carregando texto="Carregando cadastro..." />;
  if (erro) return <Alerta>{erro}</Alerta>;
  if (!form || !perfil) return null;

  return (
    <form onSubmit={salvar} className="pilha">
      <Card>
        <div className="linha-entre">
          <div>
            <h2>{perfil.nome || perfil.email}</h2>
            <p className="texto-suave">{perfil.email}{perfil.idade !== null && ` · ${perfil.idade} anos`}</p>
          </div>
          <div className="pilha" style={{ gap: 6, alignItems: 'flex-end' }}>
            <span className="texto-suave texto-pequeno">Código de cliente</span>
            <span className="codigo-cliente" title="Use este código ao falar com a equipe Oule">{perfil.codigoCliente || '—'}</span>
          </div>
        </div>
        <div className="progresso-cadastro" style={{ marginTop: 14 }}>
          <span className="texto-pequeno">Cadastro {perfil.completude}% completo</span>
          <Barra pct={perfil.completude} cor={perfil.completude === 100 ? 'var(--sucesso)' : undefined} />
        </div>
        {perfil.completude < 100 && (
          <p className="texto-suave texto-pequeno" style={{ marginTop: 6 }}>
            Com o cadastro completo, o planejamento de aposentadoria e os comparativos com pessoas de perfil parecido ficam mais precisos.
          </p>
        )}
      </Card>

      <Alerta>{erroSalvar}</Alerta>

      <Card titulo="Dados pessoais" icone="👤">
        <div className="grade-form">
          <Campo rotulo="Nome completo" className="inteira"><input required minLength={2} maxLength={120} value={form.nome} onChange={set('nome')} /></Campo>
          <Campo rotulo="Telefone / WhatsApp"><input type="tel" maxLength={30} value={form.telefone} onChange={set('telefone')} placeholder="(11) 99999-9999" /></Campo>
          <Campo rotulo="Data de nascimento"><input type="date" value={form.dataNascimento} onChange={set('dataNascimento')} /></Campo>
          <Campo rotulo="Estado civil">
            <select value={form.estadoCivil} onChange={set('estadoCivil')}>
              <option value="">Prefiro não informar</option>
              {(opcoes?.estadosCivis || []).map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Dependentes"><input type="number" min="0" max="20" value={form.dependentes} onChange={set('dependentes')} /></Campo>
          <Campo rotulo="Cidade"><input maxLength={80} value={form.cidade} onChange={set('cidade')} /></Campo>
          <Campo rotulo="Estado (UF)">
            <select value={form.estado} onChange={set('estado')}>
              <option value="">Selecione</option>
              {(opcoes?.ufs || []).map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Campo>
          <Campo rotulo="País"><input maxLength={60} value={form.pais} onChange={set('pais')} /></Campo>
        </div>
      </Card>

      <Card titulo="Trabalho e renda" icone="💼">
        <div className="grade-form">
          <Campo rotulo="Forma de trabalho">
            <select value={form.formaTrabalho} onChange={set('formaTrabalho')}>
              <option value="">Selecione</option>
              {(opcoes?.formasTrabalho || []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Profissão"><input maxLength={80} value={form.profissao} onChange={set('profissao')} placeholder="Ex.: Engenheira, Professor, Designer" /></Campo>
          <Campo rotulo="Renda mensal líquida (R$)" ajuda="Usada quando ainda não há transações suficientes."><input type="number" min="0" step="0.01" value={form.rendaMensal} onChange={set('rendaMensal')} /></Campo>
          <Campo rotulo="Banco principal">
            <select value={form.bancoConectado} onChange={set('bancoConectado')}>
              <option value="">Selecione</option>
              {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Campo>
        </div>
      </Card>

      <Card titulo="TAGs de perfil" icone="🏷️">
        <p className="texto-suave" style={{ marginBottom: 10 }}>Geradas automaticamente a partir do cadastro:</p>
        <div className="tags" style={{ marginBottom: 16 }}>
          {perfil.tagsAutomaticas.length === 0 ? <span className="texto-suave texto-pequeno">Preencha forma de trabalho, profissão, país, UF e nascimento.</span> : perfil.tagsAutomaticas.map((t) => <span key={t} className="tag tag-bank">{t}</span>)}
        </div>
        <Campo rotulo="TAGs personalizadas" ajuda="Ex.: investidor iniciante, casa própria, filhos pequenos, MEI.">
          <div className="linha">
            <input
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              maxLength={30}
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  adicionarTag();
                }
              }}
            />
            <button type="button" className="btn btn-secundario" onClick={adicionarTag} disabled={!novaTag.trim()}>Adicionar</button>
          </div>
        </Campo>
        <div className="tags" style={{ marginTop: 10 }}>
          {form.tags.map((t) => (
            <span key={t} className="chip ativo">
              {t}
              <button type="button" aria-label={`Remover ${t}`} onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}>✕</button>
            </span>
          ))}
        </div>
      </Card>

      {ehStaff && (
        <Card titulo="Anotações internas da equipe" icone="🗒️">
          <Campo rotulo="Visível só para planejadores e administração" ajuda="O cliente não vê este campo.">
            <textarea maxLength={2000} value={form.observacoesPlanejador} onChange={set('observacoesPlanejador')} />
          </Campo>
        </Card>
      )}

      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar cadastro'}</button>
      </div>
    </form>
  );
}
