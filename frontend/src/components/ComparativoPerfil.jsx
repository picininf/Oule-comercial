import React, { useState } from 'react';
import { Carregando, Alerta, Vazio, useValores } from './ui';
import { useApi } from '../hooks/useApi';
import { categoriaInfo } from '../lib/categorias';
import { formatarPct, qs } from '../lib/format';

/**
 * "Eu x pessoas com perfil parecido" (antiga aba Análise de Gastos, que
 * repetia o Início). Média mensal dos últimos meses, comparada de forma
 * anônima com grupos do mesmo estado, faixa etária e forma de trabalho.
 */
export default function ComparativoPerfil({ userId = null, onNavegar }) {
  const { fmt } = useValores();
  const [meses, setMeses] = useState(3);
  const [grupoId, setGrupoId] = useState(null);
  const { dados, carregando, erro } = useApi(`/analises/comparativo${qs({ meses, userId })}`);

  const grupos = dados?.grupos || [];
  const grupo = grupos.find((g) => g.id === grupoId && g.suficiente) || grupos.find((g) => g.suficiente);
  const meu = dados?.meu;

  return (
    <div className="pilha" style={{ gap: 14 }}>
      <div className="linha-entre">
        <span className="texto-suave texto-pequeno">Sua média por mês, comparada com quem tem perfil parecido.</span>
        <div className="segmentado" role="group" aria-label="Período">
          {[3, 6, 12].map((m) => <button key={m} type="button" className={meses === m ? 'ativo' : ''} onClick={() => setMeses(m)}>{m} meses</button>)}
        </div>
      </div>
      <Alerta>{erro}</Alerta>

      {carregando && !dados ? <Carregando texto="Comparando seus gastos..." /> : !meu ? (
        <Vazio icone="📈" texto="Assim que houver gastos no período, mostramos a comparação aqui." />
      ) : (
        <>
          <div className="linha" style={{ gap: 8 }}>
            {grupos.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`chip ${grupo?.id === g.id ? 'ativo' : ''}`}
                disabled={!g.suficiente}
                title={g.suficiente ? '' : `Só ${g.pessoas} pessoas com dados — mostramos grupos a partir de ${dados.tamanhoMinimoGrupo} para preservar a privacidade.`}
                onClick={() => setGrupoId(g.id)}
                style={!g.suficiente ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                {g.nome}{g.suficiente ? ` (${g.pessoas})` : ' 🔒'}
              </button>
            ))}
          </div>

          {!grupo ? (
            <Vazio
              icone="🔒"
              titulo="Ainda não há pessoas suficientes para comparar"
              texto={`Por privacidade, só comparamos com grupos de pelo menos ${dados.tamanhoMinimoGrupo} pessoas. Complete seu cadastro (estado, nascimento e forma de trabalho) para entrar nos grupos.`}
              acao={onNavegar && <button type="button" className="btn btn-secundario" onClick={() => onNavegar('perfil')}>Completar cadastro</button>}
            />
          ) : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Categoria</th><th className="num">Eu (R$/mês)</th><th className="num">Grupo (R$/mês)</th><th>Diferença</th></tr>
                </thead>
                <tbody>
                  {grupo.categorias.map((c) => {
                    const dif = c.media > 0 ? ((c.meu / c.media) - 1) * 100 : null;
                    return (
                      <tr key={c.categoria}>
                        <td><span className="tag-categoria">{categoriaInfo(c.categoria).icone} {c.categoria}</span></td>
                        <td className="num">{fmt(c.meu)}</td>
                        <td className="num">{fmt(c.media)}</td>
                        <td>
                          {dif === null ? '—' : (
                            <span className={`tag ${dif > 25 ? 'tag-perigo' : dif < -25 ? 'tag-sucesso' : ''}`}>
                              {dif > 0 ? '▲' : '▼'} {formatarPct(Math.abs(dif), 0)} {dif > 0 ? 'acima' : 'abaixo'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="texto-suave texto-pequeno" style={{ margin: 0 }}>Comparação anônima: ninguém vê os seus dados, e você não vê os de ninguém.</p>
        </>
      )}
    </div>
  );
}
