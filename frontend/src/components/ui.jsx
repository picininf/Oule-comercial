import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { formatarMoeda } from '../lib/format';

/* =====================================================================
   Valores (exibir/ocultar) — substitui o formatCurrency passado de
   componente em componente.
   ===================================================================== */
const ValoresContext = createContext({ ocultar: false, setOcultar: () => {}, fmt: formatarMoeda });

export function ValoresProvider({ children }) {
  const [ocultar, setOcultar] = useState(() => {
    try {
      return localStorage.getItem('oule_ocultar_valores') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('oule_ocultar_valores', ocultar ? '1' : '0');
    } catch {
      /* armazenamento indisponível: preferência só vale nesta sessão */
    }
  }, [ocultar]);
  const fmt = useCallback((v) => (ocultar ? 'R$ ••••' : formatarMoeda(v)), [ocultar]);
  const valor = useMemo(() => ({ ocultar, setOcultar, fmt }), [ocultar, fmt]);
  return <ValoresContext.Provider value={valor}>{children}</ValoresContext.Provider>;
}

export const useValores = () => useContext(ValoresContext);

/* =====================================================================
   Toasts (avisos rápidos) — substituem os alert() do navegador.
   ===================================================================== */
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remover = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const mostrar = useCallback(
    (texto, tipo = 'sucesso', duracao = 4000) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-3), { id, texto, tipo }]);
      setTimeout(() => remover(id), duracao);
    },
    [remover]
  );
  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div className="toast-area" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo}`}>
            <span>{t.tipo === 'erro' ? '⚠️' : t.tipo === 'info' ? 'ℹ️' : '✅'}</span>
            <p>{t.texto}</p>
            <button type="button" aria-label="Fechar aviso" onClick={() => remover(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* =====================================================================
   Modal acessível: ESC fecha, foco preso no diálogo, rolagem interna,
   espaçamento interno consistente (nada de texto colado na borda).
   ===================================================================== */
export function Modal({ titulo, subtitulo, aberto = true, onFechar, children, rodape, largura = 'md' }) {
  const ref = useRef(null);
  // Guardado em ref: o pai costuma passar uma função nova a cada render e
  // isso não pode reiniciar o efeito (o foco pularia de volta ao 1º campo).
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    if (!aberto) return undefined;
    const anterior = document.activeElement;
    const tecla = (e) => {
      if (e.key === 'Escape') fecharRef.current?.();
    };
    document.addEventListener('keydown', tecla);
    document.body.classList.add('modal-aberto');
    setTimeout(() => ref.current?.querySelector('input, select, textarea, button:not(.modal-fechar)')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.classList.remove('modal-aberto');
      anterior?.focus?.();
    };
  }, [aberto]);

  if (!aberto) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <div className={`modal modal-${largura}`} role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <header className="modal-cabecalho">
          <div>
            <h3>{titulo}</h3>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onFechar}>✕</button>
        </header>
        <div className="modal-corpo">{children}</div>
        {rodape && <footer className="modal-rodape">{rodape}</footer>}
      </div>
    </div>
  );
}

/* =====================================================================
   Blocos de página
   ===================================================================== */
export function Card({ titulo, icone, acoes, children, className = '', semPadding = false, ...resto }) {
  return (
    <section className={`card ${semPadding ? 'card-sem-padding' : ''} ${className}`} {...resto}>
      {(titulo || acoes) && (
        <header className="card-cabecalho">
          {titulo && <h3>{icone && <span className="card-icone">{icone}</span>}{titulo}</h3>}
          {acoes && <div className="card-acoes">{acoes}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Vazio({ icone = '📭', titulo, texto, acao }) {
  return (
    <div className="vazio">
      <span className="vazio-icone" aria-hidden="true">{icone}</span>
      {titulo && <strong>{titulo}</strong>}
      {texto && <p>{texto}</p>}
      {acao}
    </div>
  );
}

export function Carregando({ texto = 'Carregando...' }) {
  return (
    <div className="carregando" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

export function Alerta({ tipo = 'erro', children }) {
  if (!children) return null;
  return <div className={`alerta alerta-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>{children}</div>;
}

export function Metrica({ rotulo, valor, icone, tom = 'neutro', detalhe }) {
  return (
    <div className={`metrica metrica-${tom}`}>
      <div className="metrica-topo">
        <span className="metrica-rotulo">{rotulo}</span>
        {icone && <span className="metrica-icone" aria-hidden="true">{icone}</span>}
      </div>
      <div className="metrica-valor">{valor}</div>
      {detalhe && <div className="metrica-detalhe">{detalhe}</div>}
    </div>
  );
}

export function Barra({ pct, cor, alerta = false }) {
  const largura = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="barra">
      <div className={`barra-preenchida ${alerta ? 'barra-alerta' : ''}`} style={{ width: `${largura}%`, ...(cor ? { background: cor } : {}) }} />
    </div>
  );
}

export function Abas({ abas, ativa, onTrocar }) {
  return (
    <div className="abas" role="tablist">
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          role="tab"
          aria-selected={ativa === a.id}
          className={`aba ${ativa === a.id ? 'ativa' : ''}`}
          onClick={() => onTrocar(a.id)}
        >
          {a.icone && <span aria-hidden="true">{a.icone}</span>} {a.nome}
        </button>
      ))}
    </div>
  );
}

/** Conclusões/dicas com tom (positivo | atencao | alerta | neutro). */
export function ListaConclusoes({ itens }) {
  if (!itens || itens.length === 0) return null;
  const icone = { positivo: '✅', atencao: '⚠️', alerta: '🚨', neutro: '💡' };
  return (
    <ul className="conclusoes">
      {itens.map((c, i) => (
        <li key={i} className={`conclusao conclusao-${c.tom || 'neutro'}`}>
          <span className="conclusao-icone" aria-hidden="true">{icone[c.tom] || '💡'}</span>
          <div>
            <strong>{c.titulo}</strong>
            <p>{c.texto}</p>
            {c.impacto && <p className="conclusao-impacto">🎯 {c.impacto}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Campo de formulário padronizado (rótulo + controle + ajuda). */
export function Campo({ rotulo, ajuda, children, className = '' }) {
  return (
    <label className={`campo ${className}`}>
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {ajuda && <span className="campo-ajuda">{ajuda}</span>}
    </label>
  );
}

/** Confirmação com modal próprio (no lugar do window.confirm). */
export function useConfirmacao() {
  const [pedido, setPedido] = useState(null);
  const confirmar = useCallback(
    (opcoes) => new Promise((resolve) => setPedido({ ...opcoes, resolve })),
    []
  );
  const fechar = (resposta) => {
    pedido?.resolve(resposta);
    setPedido(null);
  };
  const elemento = pedido ? (
    <Modal
      titulo={pedido.titulo || 'Confirmar'}
      onFechar={() => fechar(false)}
      largura="sm"
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={() => fechar(false)}>Cancelar</button>
          <button type="button" className={`btn ${pedido.perigo ? 'btn-perigo' : 'btn-primario'}`} onClick={() => fechar(true)}>
            {pedido.confirmar || 'Confirmar'}
          </button>
        </>
      }
    >
      <p className="texto-modal">{pedido.texto}</p>
    </Modal>
  ) : null;
  return [confirmar, elemento];
}
