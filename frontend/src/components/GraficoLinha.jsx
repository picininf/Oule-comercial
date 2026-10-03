import React from 'react';
import { formatarMoedaCompacta } from '../lib/format';

/**
 * Gráfico de linhas simples em SVG (sem biblioteca externa).
 * @param {Array<string>} rotulos - eixo X
 * @param {Array<{nome, cor, valores: number[], tracejado?: boolean}>} series
 */
export default function GraficoLinha({ rotulos, series, altura = 240, ocultarValores = false }) {
  const largura = 720;
  const margem = { topo: 14, direita: 16, base: 28, esquerda: 64 };
  const todos = series.flatMap((s) => s.valores).filter((v) => Number.isFinite(v));
  if (todos.length === 0) return null;

  const min = Math.min(0, ...todos);
  const max = Math.max(1, ...todos);
  const w = largura - margem.esquerda - margem.direita;
  const h = altura - margem.topo - margem.base;
  const x = (i) => margem.esquerda + (rotulos.length <= 1 ? w / 2 : (i / (rotulos.length - 1)) * w);
  const y = (v) => margem.topo + h - ((v - min) / (max - min || 1)) * h;
  const linhasGrade = 4;
  const passoRotulo = Math.ceil(rotulos.length / 10);

  return (
    <div>
      <svg className="grafico" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={series.map((s) => s.nome).join(', ')}>
        {Array.from({ length: linhasGrade + 1 }, (_, i) => {
          const v = min + ((max - min) / linhasGrade) * i;
          return (
            <g key={i}>
              <line className="grade-linha" x1={margem.esquerda} x2={largura - margem.direita} y1={y(v)} y2={y(v)} />
              <text x={margem.esquerda - 8} y={y(v) + 4} textAnchor="end">{ocultarValores ? '••' : formatarMoedaCompacta(v)}</text>
            </g>
          );
        })}
        {min < 0 && <line x1={margem.esquerda} x2={largura - margem.direita} y1={y(0)} y2={y(0)} stroke="var(--texto-fraco)" />}
        {rotulos.map((r, i) => (i % passoRotulo === 0 || i === rotulos.length - 1) && (
          <text key={r} x={x(i)} y={altura - 8} textAnchor="middle">{r}</text>
        ))}
        {series.map((s) => (
          <g key={s.nome}>
            <polyline
              fill="none"
              stroke={s.cor}
              strokeWidth="2.5"
              strokeDasharray={s.tracejado ? '6 5' : undefined}
              strokeLinejoin="round"
              points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            />
            {!s.tracejado && s.valores.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.cor}><title>{`${rotulos[i]}: ${ocultarValores ? '••' : formatarMoedaCompacta(v)}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <div className="grafico-legenda">
        {series.map((s) => (
          <span key={s.nome}><i className="legenda-cor" style={{ background: s.cor }} />{s.nome}</span>
        ))}
      </div>
    </div>
  );
}
