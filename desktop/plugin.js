/**
 * SoFi Experiment board — desktop plugin for Hermes.
 * Shows the guided-vs-rules A/B scoreboard, effective positions with
 * stop/trim distances, recent trades per book, and the events calendar.
 * Data: GET /api/plugins/sofi-experiment/board (served by the paired
 * Python backend; refreshes hourly via the watchdog timer).
 */

import { Badge, Button, host, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, useQuery } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'sofi-experiment'
let ctxRef = null

const money = n => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const pct = n => (n == null ? '—' : (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%')
const retClass = n => (n == null ? 'text-(--ui-text-tertiary)' : n >= 0 ? 'text-(--ui-accent)' : 'text-red-500')

function useBoard() {
  return useQuery({
    queryKey: ['sofi-board'],
    queryFn: () => ctxRef.rest('/board'),
    refetchInterval: 60000
  })
}

function Freshness({ iso }) {
  if (!iso) return jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: 'no snapshot yet' })
  const ageH = (Date.now() - new Date(iso).getTime()) / 3.6e6
  const stale = ageH > 24
  return jsx(Badge, {
    variant: stale ? 'destructive' : 'secondary',
    children: stale ? `snapshot stale (${Math.round(ageH)}h)` : `snapshot ${Math.max(0, Math.round(ageH * 60))}m old`
  })
}

function Scoreboard({ exp }) {
  if (!exp || exp.error) return jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'experiment: ' + (exp && exp.error ? exp.error : 'loading') })
  const d = exp.books.D
  const b = exp.books.B
  const card = (book, name) => jsxs('div', {
    className: 'flex flex-col gap-1 rounded-md border border-(--ui-stroke-secondary) p-3',
    children: [
      jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: name }),
      jsx('div', { className: 'text-2xl font-semibold ' + retClass(book.return_pct), children: pct(book.return_pct) }),
      jsxs('div', { className: 'text-xs text-(--ui-text-tertiary)', children: [money(book.equity), ' on ', money(book.invested), ' · cash ', money(book.cash), ' · ', book.trade_count, ' trades'] })
    ]
  })
  return jsxs('div', { className: 'grid grid-cols-3 gap-3', children: [
    card(d, 'Diego guided (D)'),
    card(b, 'Bot rules (B)'),
    jsxs('div', { className: 'flex flex-col gap-1 rounded-md border border-(--ui-stroke-secondary) p-3', children: [
      jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Verdict' }),
      jsx('div', { className: 'text-lg font-semibold', children: exp.verdict }),
      jsxs('div', { className: 'text-xs text-(--ui-text-tertiary)', children: [
        'B−D ', pct(exp.diff_pts), ' · QQQM shadow ', pct(exp.qqqm_return_pct)
      ] })
    ] })
  ] })
}

function Positions({ rows }) {
  if (!rows || !rows.length) return jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'no positions' })
  const head = ['ticker', 'weight', 'value', 'price', 'basis', 'stop', 'trim', 'status']
  return jsxs('table', { className: 'w-full text-xs', children: [
    jsx('thead', { children: jsx('tr', { className: 'text-left text-(--ui-text-tertiary)', children: head.map(h => jsx('th', { className: 'py-1 pr-3 font-medium', children: h }, h)) }) }),
    jsx('tbody', { children: rows.map(p => jsxs('tr', { className: 'border-t border-(--ui-stroke-secondary)', children: [
      jsx('td', { className: 'py-1 pr-3 font-medium', children: p.ticker }),
      jsxs('td', { className: 'py-1 pr-3', children: [
        p.weight_pct != null ? jsx('div', { className: 'flex items-center gap-2', children: [
          jsx('div', { className: 'h-1.5 w-16 overflow-hidden rounded bg-(--ui-stroke-secondary)', children:
            jsx('div', { className: 'h-full bg-(--ui-accent)', style: { width: Math.min(100, p.weight_pct * 2.5) + '%' } }) }),
          jsx('span', { children: p.weight_pct.toFixed(1) + '%' })
        ] }) : '—'
      ] }),
      jsx('td', { className: 'py-1 pr-3', children: money(p.value) }),
      jsx('td', { className: 'py-1 pr-3', children: money(p.price) }),
      jsx('td', { className: 'py-1 pr-3 text-(--ui-text-tertiary)', children: p.basis ? money(p.basis) : 'unknown' }),
      jsx('td', { className: 'py-1 pr-3 text-(--ui-text-tertiary)', children: money(p.stop_px) }),
      jsx('td', { className: 'py-1 pr-3 text-(--ui-text-tertiary)', children: money(p.trim_px) }),
      jsx('td', { className: 'py-1', children: p.status === 'ok' ? jsx('span', { className: 'text-(--ui-text-tertiary)', children: 'ok' }) : jsx(Badge, { variant: 'destructive', children: p.status.toUpperCase() }) })
    ] }, p.ticker)) })
  ] })
}

function TradeList({ title, trades }) {
  const rows = trades || []
  return jsxs('div', { className: 'flex min-w-0 flex-1 flex-col gap-1', children: [
    jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: title }),
    rows.length ? jsx('ul', { className: 'flex flex-col gap-0.5 text-xs', children: rows.slice().reverse().map((t, i) => jsxs('li', { className: 'truncate', children: [
      jsx('span', { className: 'text-(--ui-text-tertiary)', children: t.date + ' ' }),
      t.side, ' ', jsx('span', { className: 'font-medium', children: t.ticker }),
      ' ', money(t.price), ' × ', t.shares
    ] }, i) }) }) : jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'none yet' })
  ] })
}

function Board() {
  const { data, isPending, error, refetch } = useBoard()
  if (isPending) return jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'loading board…' })
  if (error) return jsxs('div', { className: 'flex flex-col gap-2 p-4 text-sm', children: [
    jsx('div', { className: 'text-red-500', children: 'backend unavailable: ' + String(error.message || error) }),
    jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'Is the sofi-experiment Python plugin enabled and the gateway restarted? The board also needs a snapshot: run sofi_engine.py --board on ai-agent.' }),
    jsx(Button, { size: 'sm', onClick: () => refetch(), children: 'Retry' })
  ] })
  const exp = data.experiment || {}
  return jsxs('div', { className: 'flex h-full flex-col gap-4 overflow-auto p-4 text-sm', children: [
    jsxs('div', { className: 'flex items-center gap-3', children: [
      jsx('div', { className: 'text-lg font-semibold', children: 'SoFi Experiment' }),
      jsx(Freshness, { iso: data.generated_at }),
      jsx('div', { className: 'ml-auto flex items-center gap-2 text-xs text-(--ui-text-tertiary)', children: 'account ' + money(data.account_value) + ' · cash ' + money(data.cash) }),
      jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => refetch(), children: 'Refresh' })
    ] }),
    jsx(Scoreboard, { exp }),
    jsx(Positions, { rows: data.positions }),
    jsxs('div', { className: 'flex gap-6', children: [
      jsx(TradeList, { title: 'Book D — Diego guided', trades: exp.books && exp.books.D && exp.books.D.trades }),
      jsx(TradeList, { title: 'Book B — Bot rules', trades: exp.books && exp.books.B && exp.books.B.trades })
    ] }),
    data.events && data.events.length ? jsxs('div', { className: 'flex flex-col gap-1', children: [
      jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Upcoming events' }),
      jsx('ul', { className: 'text-xs', children: data.events.map((e, i) => jsxs('li', { children: [
        jsx('span', { className: 'text-(--ui-text-tertiary)', children: e.date + ' ' }), e.ticker, ': ', e.event
      ] }, i) }) })
    ] }) : null
  ] })
}

export default {
  id: ID,
  name: 'SoFi Experiment',
  register(ctx) {
    ctxRef = ctx
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: '/sofi' }, render: () => jsx(Board, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: '/sofi', label: 'SoFi Experiment', codicon: 'graph' } },
      { id: 'open', area: PALETTE_AREA, data: { id: 'sofi.open', label: 'Open SoFi Experiment board', keywords: ['sofi', 'portfolio', 'experiment'], run: () => host.navigate('/sofi') } }
    ])
  }
}