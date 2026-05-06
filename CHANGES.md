# Mudanças aplicadas — 06/05/2026 — Reforma de taxas + aba "Competência × Caixa"

## Resumo
Duas mudanças paralelas, mesmo patch:

1. **Taxas de Plataforma deixam de ser despesa a partir de 2026.** A partir de 2026, a receita exibida já vem líquida das taxas (= `netEarnings`); até 2025, comportamento histórico preservado (receita bruta + linha de despesa "Taxas de Plataforma"). Corte é por ano, sem reescrita do passado.
2. **Nova aba "Competência × Caixa".** Compara, por mês, as reservas com check-in no período (regime de competência) com o que efetivamente foi depositado pelas plataformas (regime de caixa).

## Parte 1 — Taxas de Plataforma

### Helper central (NOVO arquivo)
- **`utils/feeMode.ts`** — concentra a regra: `isFeesAsExpense(year)`, `getRevenueLabel(year)`, `getReservationRevenue(res, year)`. Único ponto de decisão; se um dia o critério mudar (ex: virar configurável), troca-se aqui.

### Arquivos alterados

#### `components/reports/FinancialReport.tsx` — Relatório Mensal (Competência)
- Receita: `grossEarnings` (até 2025) → `netEarnings` (2026+).
- "Taxas de Plataforma" sai da lista de despesas em 2026+ e o dataset desaparece do gráfico (não vira barra com 0 nem entrada na legenda).
- KPI Card "Receita Bruta" → "Receita" em 2026+ (via `getRevenueLabel`).
- Tabela de detalhes na tela: 2026+ exibe apenas `[FLAT, HÓSPEDE, CHECK-IN, RECEITA]`; 2025 e antes mantém as 6 colunas com bruto/taxa/líquido.
- Exportação PDF e Excel ajustadas com o mesmo critério.
- Resumo PDF mostra "Receita" ou "Receitas Brutas" conforme o ano.
- Cálculo de yearlyFinancials (gráfico anual no topo) também respeita o critério.

#### `components/reports/YearlyFinancialSummaryReport.tsx` — Relatório Anual (Competência)
- `monthlyRevenue` usa `getReservationRevenue(res, year)`.
- "Taxas de Plataforma" só entra em `expenseDetails` se ano ≤ 2025.
- `totalExpenses` ignora `platformFees` em 2026+.
- Modal de detalhes do mês (`detailsData`, `flatMatrixData`) usa o mesmo critério.

#### `components/Dashboard.tsx`
- Cálculo de `grossRevenue` e `totalExpenses` por mês respeita o ano de cada cálculo (importante porque o dashboard pré-calcula 12 meses do ano atual e do ano anterior — cada um com seu próprio critério).
- `platformRev` e `flatRev` (gráficos de receita por plataforma/flat) usam o critério.
- **ADR (diária média) preserva `grossEarnings`** sempre, independente do ano. ADR é métrica de mercado (qual diária está sendo praticada), e mudar para net distorceria comparações históricas de pricing.

### Decisões deliberadas (NÃO alterados)
- `types.ts` — `Reservation.fees` segue existindo no modelo. Mudança é só de apresentação.
- `services/dataService.ts` — segue calculando `netEarnings = grossEarnings - fees`.
- `utils/reconciliation.ts` — usa `netEarnings`, já correto para ambos os regimes.
- `components/reports/CashFlowReport.tsx` / `YearlyCashFlowReport.tsx` — regime de caixa puro, não toca em `fees`.
- `components/reports/CarneLeaoReport.tsx` / `FiscalReport.tsx` / `NfseControlReport.tsx` — Carnê Leão não é mais usado em 2026; abas seguem intactas para consultar histórico.
- `components/reports/DynamicPricingReport.tsx` — ADR continua em `grossEarnings` (mesma lógica do Dashboard).
- `components/reports/CalendarReport.tsx` / `ReceptionCleaningReport.tsx` — telas operacionais, mantêm exibição de bruto + taxa + líquido como informação útil.

## Parte 2 — Aba "Competência × Caixa"

### Novo arquivo
- **`components/reports/CashAccrualCompareReport.tsx`** — visão mensal de conciliação por competência.

### Estrutura da aba
- **Filtro de flats** (201/202/301) — independente do filtro do Relatório Mensal.
- **4 KPIs no topo**: Receita esperada (competência), Já recebida, Pendente, Status geral.
- **Tabela por plataforma** (Airbnb / Booking / Decolar / Particular / Outros): nº de reservas, esperado, recebido, pendente, badge de status, botão "Ver detalhes".
- **Detalhe expandido por plataforma**: lista cada reserva com hóspede, flat, check-in, esperado, recebido e badge de status.
- **Bloco "Depósitos do mês sem reserva conciliada"**: depósitos que caíram no mês mas não casaram com nada (úteis para revisar conciliações).

### Lógica de status por reserva
- ✅ **Pago em [Mês/Ano]** — conciliada com depósito; cor verde se depósito caiu no mesmo mês da competência, azul se em outro mês.
- ⚠️ **Divergência** — conciliada mas valor recebido difere do esperado em mais de R$ 0,50 (mostra a diferença).
- ⏳ **Aguardando depósito** — não casou com nenhum depósito.
- 🔵 **Particular** — paga direto, considerada quitada (não passa pelo banco).

### Lógica de divisão proporcional (depósitos agrupados)
Quando uma reserva está num par `Sum`/`Pre-defined` (depósito casou com várias reservas), o valor recebido individual é calculado proporcionalmente ao `netEarnings` da reserva sobre o total `netEarnings` do grupo.

### Atalho "Conciliar →" / "Revisar →"
Botão na linha da reserva pendente ou divergente leva direto para a aba "Conciliação manual" com aquela reserva pré-selecionada.

### Arquivos alterados para suportar o atalho
- **`types.ts`** — adicionado `ReportType.CashAccrualCompare = 'cashAccrualCompare'`.
- **`components/Sidebar.tsx`** — adicionado item "Competência × Caixa" no grupo "Regime de Caixa".
- **`App.tsx`** — adicionado import, estado `pendingManualConciliationReservationId`, e roteamento da nova aba; `InteractiveCompensationReport` passou a receber `initialSelectedReservationId` e `onInitialSelectionConsumed`.
- **`components/reports/InteractiveCompensationReport.tsx`** — duas props opcionais novas (`initialSelectedReservationId`, `onInitialSelectionConsumed`); `useEffect` aplica a seleção inicial e dispara o callback de limpeza.

## Validação
- `vite build` → ✅ sucesso
- `tsc --noEmit` → 4 erros pré-existentes (Chart.js em Dashboard.tsx e FinancialReport.tsx), nenhum introduzido por esta mudança.

---

# Mudanças aplicadas — Importação no formato Ape-Codex

## Problema
O painel não estava recebendo os dados da planilha base porque `processReservations` esperava um array de objetos (`Record<string, any>[]`), mas o backend Apps Script retorna `reservationsData` como matriz `any[][]` (linha 0 = cabeçalho), formato original do Ape-Codex.

## Arquivos alterados

### 1. `services/dataService.ts`
- **`processReservations(rows: any[][])`** — restaurado para receber matriz, exatamente como no Ape-Codex. Constrói `headerMap` a partir da linha 0, tolera `chegada` ou `data de check-in`, e mantém toda a normalização de flats (201/202/301), canais (AIRBNB/BOOKING/DECOLAR/Particular) e geração de `stableId`.
- **`uploadReservationsSheet(sheetData: any[][], month?, year?)`** — agora envia matriz pura (igual ao Ape-Codex). Os parâmetros `month`/`year` continuam opcionais para o backend usar como filtro de substituição parcial; quando omitidos, o backend faz substituição completa.
- **`uploadDepositsSheet`** — `month`/`year` também opcionais agora (assinatura compatível com o uso anterior).
- Mantidas todas as adições do painel: `dismissedAutoMatches` em `fetchInitialData`, `saveDismissedAutoMatches`, `saveNfseData`, `saveNewReservation`, `saveManualConciliations`, `saveConfigData`.

### 2. `App.tsx`
- **`handleFileUpload`** — agora lê com `XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", blankrows: false })`, produzindo matriz. Filtra reservas de 2026 com `headerMap` (sem depender de `getField`). Preserva a linha de cabeçalho no array filtrado.
- **`confirmImport`** — segmenta as linhas por mês via `headerMap`, e para cada mês envia `[headerRow, ...linhasDoMês]` ao backend.
- Removido o import não utilizado de `getField`.
- Adicionado import de `FinancialData` (corrigindo um erro pré-existente).

### 3. `services/dataService.ts` — `processReservations`
- Anotação explícita de retorno `Reservation | null` no `.map(...)` para o type predicate `(r): r is Reservation` aceitar o opcional `confirmationCode`.

## Itens preservados (intactos)
- `ManualDepositModal` e fluxo de depósito manual.
- `NfseControlReport`, `FiscalReport`, `dismissedAutoMatches`, undo de auto-conciliação.
- `getField` permanece exportado em `utils/helpers.ts` (não é mais usado no fluxo de importação, mas pode ser útil em outros pontos).

## Validação
- `vite build` → ✅ sucesso
- `tsc --noEmit` → 4 erros pré-existentes (Chart.js em Dashboard.tsx e FinancialReport.tsx), nenhum introduzido por esta mudança.
