import React from 'react';
import { useApi } from '../hooks/useApi';
import { formatarData, qs } from '../lib/format';
import { useValores } from './ui';

const ROTULO = {
  atrasado: 'atrasada',
  vence_hoje: 'vence hoje',
  vence_em_breve: 'vence em breve',
  pendente: 'a vencer',
};

/** Aviso in-app de contas vencendo/atrasadas (complementa o lembrete no WhatsApp). */
export default function AvisoVencimentos({ userId = null, onVerTodas }) {
  const { fmt } = useValores();
  const { dados } = useApi(`/pagamentos/proximos${qs({ userId, dias: 5 })}`);
  if (!dados || dados.length === 0) return null;

  const atrasadas = dados.filter((c) => c.status === 'atrasado').length;
  return (
    <div className="aviso-vencimentos" role="status">
      <span style={{ fontSize: 22 }} aria-hidden="true">{atrasadas ? '🔴' : '🔔'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>
          {atrasadas
            ? `${atrasadas} ${atrasadas === 1 ? 'conta atrasada' : 'contas atrasadas'}`
            : `${dados.length} ${dados.length === 1 ? 'conta vence' : 'contas vencem'} nos próximos dias`}
        </strong>
        <ul>
          {dados.slice(0, 4).map((c) => (
            <li key={`${c.id}-${c.mes}`}>
              {c.descricao} — {fmt(c.valor)} · {formatarData(c.vencimento)} ({ROTULO[c.status]})
            </li>
          ))}
        </ul>
      </div>
      {onVerTodas && <button type="button" className="btn btn-secundario btn-pequeno" onClick={onVerTodas}>Ver pagamentos</button>}
    </div>
  );
}
