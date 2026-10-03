# Atualização — backlog do Trello "Oule | App"

## ⚠️ Antes de rodar

1. **Banco:** rode `backend/sql/schema_v4_oule.sql` no SQL Editor do Supabase.
2. **Backend:** `npm install` (nova dependência: SheetJS para planilhas) e
   depois `npm run normalizar:categorias` uma vez.
3. **`.env` do backend:** defina `ADMIN_EMAIL` (não existe mais o padrão
   `admin@gmail.com`) e veja as novas variáveis no `.env.example`.
4. **Frontend:** `npm install && npm run build`. Para o Android, rode também
   `npx cap sync android` (novos plugins de arquivo e compartilhamento).

---

## Cartões do Trello

### Em andamento

| Cartão | O que foi feito |
|---|---|
| **Importar extratos \| CSV - XLS** | Aceita **CSV, XLS, XLSX e OFX**, lidos direto das colunas, sem IA e sem custo. O leitor reconhece os layouts de Nubank, Itaú, BB, Bradesco e outros (Data/Histórico/Valor ou Débito/Crédito, vírgula ou ponto, Latin-1). Se o layout for desconhecido, a IA lê o texto. PDF e foto continuam funcionando. Dá para escolher **“Fatura do cartão X”** e cada compra cai na data de pagamento certa. Reenviar o mesmo arquivo não duplica nada. |
| **Plano \| Visualização de Futuro** | Nova aba **Futuro & Aposentadoria**: projeção de 5 a 30 anos (patrimônio, renda e gastos em valores de hoje), gráfico, tabela ano a ano e simulador “e se eu cortar X% / guardar mais R$ Y”. |
| **Faturas \| competência e caixa** | Nova aba **Cartões & Faturas**. Cada cartão tem dia de fechamento e de vencimento, e toda compra (inclusive parcelada) vai sozinha para a fatura certa. **Comprei hoje, só pago mês que vem** = data de competência (compra) × data de caixa (vencimento). Parcela N cai N−1 faturas depois. Compras no dia do fechamento ou depois vão para a fatura seguinte. Faturas aberta, fechada e futuras, limite livre e “melhor dia de compra”. Mudar o fechamento recalcula todas as compras do cartão. Transações e Plano têm a chave **Competência / Caixa**. |

### Backlog

| Cartão | O que foi feito |
|---|---|
| **Integração Sonhos x Vida Real x Plano** | O Plano diz quais sonhos cabem na sobra prevista e quanto cada um exige por mês. O Futuro simula mês a mês quando cada sonho é atingido e quantos meses atrasa. |
| **Inteligência \| Dicas** | “Dicas inteligentes” na Visão Geral: ritmo do mês, categorias acima da média, peso dos gastos opcionais, assinaturas, dívidas, poupança e contas atrasadas. Cada dica diz o impacto no sonho mais próximo (“chegaria 3 meses antes”). |
| **OpenFinance** | Correções: antes vinha só a 1ª página de transações e as compras de cartão entravam como **entrada**. Agora há paginação completa, sinal correto e cartões criados automaticamente com fechamento e vencimento. A sincronização deixou de “apagar e inserir”: preserva a categoria que o cliente corrigiu. Nova tela com conexões, status, “Atualizar agora”, “Reconectar” (senha do banco mudou) e “Desconectar”. |
| **Aposentadoria \| LF e sonhos** | Patrimônio necessário (regra da retirada segura), projeção até a idade desejada, aporte mensal ideal, idade em que atinge a liberdade financeira e gráfico. |
| **TAGs Perfil (Forma de trabalho - País - Profissão)** | TAGs automáticas a partir do cadastro (forma de trabalho, profissão, país, UF, faixa etária) + TAGs livres. A equipe busca e filtra clientes por TAG. |
| **Análise de gastos por categoria (estado, faixa etária)** | Cliente: **Análise de Gastos**, que compara de forma anônima com pessoas do mesmo estado, faixa etária e forma de trabalho (só grupos com 5 pessoas ou mais). Equipe: **Análise por Perfil**, com gastos por categoria cruzados por estado, faixa etária e forma de trabalho, com filtros. |
| **Bônus \| Ano (Cinema e outras ideias)** | **Retrospectiva do Ano**: quanto guardou, categoria campeã, lugar favorito, mês mais caro, idas ao cinema, delivery, corridas de app, cafés, shows, dias sem gastar, maior compra e sonhos realizados. Exporta como imagem para compartilhar. |
| **Aba de Pagamentos mensais** | Contas fixas com dia de vencimento, tipo de gasto, forma de pagamento (inclusive cartão), início/fim (financiamentos). Por mês: pago, a vencer, vence hoje ou atrasado. Opção de lançar o pagamento nas transações. |
| **Lembretes de vencimento** | Aviso no app (Visão Geral) + WhatsApp: X dias antes (configurável), no dia e no dia seguinte, se não estiver pago. Nunca envia duplicado. Bot com novos comandos `!contas`, `!resumo` e `!ajuda`. |
| **Código de Cliente** | Código único e sequencial (`OUL-001001`) criado no banco para todo cliente, exibido no cadastro e usado na busca da equipe. |
| **Dados cadastro Cliente** | Aba **Meu Cadastro**: nascimento, cidade/UF, país, profissão, forma de trabalho, renda, estado civil, dependentes e % de cadastro completo. A equipe tem um campo de anotações internas que o cliente não vê. CPF continua **não** sendo pedido (LGPD: dado sensível sem necessidade). |
| **Categorias Oule** | Taxonomia única (23 categorias com ícone e cor) usada no app, no orçamento, nas importações, na IA e no bot. Categorias da Pluggy em inglês e nomes antigos são convertidos automaticamente (ex.: “Taxi and ride-hailing” → Transporte, “MERCADO LIVRE” → Compras). **Transferências** entre contas próprias e o pagamento da fatura não contam como gasto, para não contar a mesma compra duas vezes. |
| **Tipos de gasto** | Recorrente \| Obrigatório, Recorrente \| Não obrigatório, Variável \| Obrigatório (+ Variável \| Não obrigatório, para fechar a matriz). Sugerido pela categoria e editável por lançamento ou para todos os lançamentos iguais de uma vez. Aparece na Visão Geral, nas análises e nos pagamentos. |

---

## Pedidos adicionais

- **Plano x Vida Real para os anos seguintes:** dá para planejar até 10 anos à
  frente. O orçamento inclui **receitas e despesas**. Há “Sugerir pela média
  dos últimos meses”, “Copiar para outros meses” (resto do ano ou o ano
  seguinte inteiro, com reajuste em %) e **premissas por ano** (inflação,
  reajuste de renda, meta de poupança, patrimônio inicial). A tela considera o
  que já está comprometido (parcelas e contas fixas) e tira conclusões:
  fechamento do ano, meta de poupança, meses no vermelho, plano otimista
  demais em relação à média real, gastos esquecidos no plano, parcelas e
  sonhos.
- **Exportar dados:** botão **Exportar** nas telas principais em **CSV,
  Excel, PDF (relatório com a marca) e PNG**. Em Configurações há exportação
  completa (Excel com abas, ou backup JSON). No app Android, o arquivo abre
  a tela de compartilhamento do sistema.
- **Design:** novo design system com tema claro, noturno e “seguir o
  sistema”. Pop-ups com espaçamento interno correto, rolagem própria e
  formato de folha de baixo para cima no celular. Avisos no lugar dos
  `alert()`. Botão **Ocultar valores só nas abas que mostram dinheiro**.
  Menu agrupado por seção, em gaveta no celular. Removidas a opção “moeda”
  (trocava R$ por $ sem converter nada) e o “teto de gastos” (não era usado).

## Correções de bugs encontrados na revisão

- Tabela de transações mostrava “Não informado” em toda linha (lia um campo
  inexistente).
- Excluir uma meta exibia “Erro no servidor (204)” mesmo dando certo.
- “Carregando infinito” e 401 intermitentes: o `useAuth` chamava a API dentro
  do callback do Supabase, que segura o lock de sessão.
- PIX recebido e estornos contavam como **gasto**.
- Admin criável por qualquer pessoa via `admin@gmail.com` e senha padrão
  `12345678` documentada.
- Servidor caía na inicialização se a Pluggy não estivesse configurada.
- O painel administrativo baixava a tabela de transações inteira a cada
  acesso; agora busca só os clientes visíveis.

Testes: `cd backend && npm test` (17 testes de regras, incluindo o Plano x
Vida Real com banco simulado).
