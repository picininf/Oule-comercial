import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * Carrega um endpoint GET e controla carregando/erro/recarregar.
 * Ignora respostas que chegam depois de o componente trocar de URL ou
 * desmontar (evita "piscar" dados do cliente anterior).
 *
 * @param {string|null} url - null = não carrega (ex.: aguardando um filtro)
 */
export function useApi(url, { manterAnterior = true } = {}) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(Boolean(url));
  const [erro, setErro] = useState('');
  const requisicaoAtual = useRef(0);

  const recarregar = useCallback(async () => {
    if (!url) {
      setCarregando(false);
      return null;
    }
    const id = ++requisicaoAtual.current;
    setCarregando(true);
    setErro('');
    if (!manterAnterior) setDados(null);
    try {
      const resposta = await api.get(url);
      if (id === requisicaoAtual.current) setDados(resposta);
      return resposta;
    } catch (err) {
      if (id === requisicaoAtual.current) setErro(err.message || 'Erro ao carregar.');
      return null;
    } finally {
      if (id === requisicaoAtual.current) setCarregando(false);
    }
  }, [url, manterAnterior]);

  useEffect(() => {
    recarregar();
    return () => {
      requisicaoAtual.current += 1;
    };
  }, [recarregar]);

  return { dados, setDados, carregando, erro, recarregar };
}
