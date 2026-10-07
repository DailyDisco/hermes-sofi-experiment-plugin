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

const KIND_STYLES = {
  stop: { variant: 'destructive', label: 'SELL' },
  trim: { variant: 'default', label: 'TRIM' },
  candidate: { variant: 'secondary', label: 'CASH' },
  info: { variant: 'outline', label: 'INFO' }
}

function Actions({ rows }) {
  if (!rows || !rows.length) return jsxs('div', { className: 'rounded-md border border-(--ui-stroke-secondary) p-3 text-sm text-(--ui-text-tertiary)', children: [
    '✓ No actions required. All rules quiet.'
  ] })
  return jsx('div', { className: 'flex flex-col gap-2', children: rows.map((a, i) => {
    const s = KIND_STYLES[a.kind] || KIND_STYLES.info
    return jsxs('div', { className: 'flex items-center gap-3 rounded-md border border-(--ui-stroke-secondary) p-3', children: [
      jsx(Badge, { variant: s.variant, children: (s.label + (a.ticker ? ' ' + a.ticker : '')) }),
      jsx('div', { className: 'min-w-0 flex-1 text-sm', children: [
        jsx('span', { className: 'font-medium', children: a.action }),
        ' ',
        jsx('span', { className: 'text-(--ui-text-tertiary)', children: a.detail })
      ] }),
      a.ticker && jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => host.navigate('/sofi'), children: 'Mark done' })
    ] }, i)
  }) })
}

function NextDeposit({ dep }) {
  if (!dep) return null
  const target = new Date(dep.date).getTime()
  const hrs = Math.max(0, (target - Date.now()) / 3.6e6)
  const label = hrs < 48 ? `${Math.round(hrs)}h` : `${Math.round(hrs / 24)}d`
  return jsx(Badge, { variant: 'secondary', children: `next $${dep.amount} deposit in ${label}` })
}

function VerdictTape({ snapshots }) {
  if (!snapshots || snapshots.length < 2) return null
  const w = 560, h = 120, pad = 6
  const vals = snapshots.flatMap(s => [s.equity.D, s.equity.B]).filter(v => v > 0)
  const min = Math.min(...vals), max = Math.max(...vals)
  const x = i => pad + i * (w - 2 * pad) / (snapshots.length - 1)
  const y = v => pad + (1 - (v - min) / (max - min || 1)) * (h - 2 * pad)
  const path = k => snapshots.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.equity[k]).toFixed(1)}`).join(' ')
  const qy = v => pad + (1 - (v - min) / (max - min || 1)) * (h - 2 * pad)
  const qPath = snapshots.map((s, i) => s.qqqm_px ? `${i ? 'L' : 'M'}${x(i).toFixed(1)},${qy(s.qqqm_px).toFixed(1)}` : '').filter(Boolean).join(' ')
  return jsxs('div', { className: 'rounded-md border border-(--ui-stroke-secondary) p-3', children: [
    jsx('div', { className: 'mb-2 text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Equity since inception (Oct 4)' }),
    jsxs('svg', { viewBox: `0 0 ${w} ${h}`, className: 'w-full', style: { height: h }, children: [
      jsx('path', { d: path('D'), fill: 'none', strokeWidth: 2, stroke: getComputedStyle(document.body).getPropertyValue('--ui-accent') || '#888' }),
      jsx('path', { d: qPath, fill: 'none', strokeWidth: 1.5, strokeDasharray: '4 3', stroke: getComputedStyle(document.body).getPropertyValue('--ui-text-tertiary') || '#666' })
    ] }),
    jsxs('div', { className: 'mt-1 flex gap-4 text-xs text-(--ui-text-tertiary)', children: [
      jsxs('span', { children: ['— D & B'] }),
      jsxs('span', { children: ['-- QQQM shadow'] })
    ] })
  ] })
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

function Scorecard({ rows }) {
  if (!rows || !rows.length) return null
  const total = rows.reduce((acc, r) => acc + (r.excess ?? 0), 0)
  return jsxs('div', { className: 'rounded-md border border-(--ui-stroke-secondary) p-3', children: [
    jsxs('div', { className: 'mb-2 flex items-baseline gap-3', children: [
      jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Decision scorecard (me vs QQQM)' }),
      jsx('span', { className: 'text-xs ' + retClass(total), children: (total >= 0 ? '+' : '') + total.toFixed(2) + ' pts total' })
    ] }),
    jsx('ul', { className: 'flex flex-col gap-1 text-xs', children: rows.map(r => jsxs('li', { className: 'flex items-center gap-2', children: [
      jsx('span', { className: 'text-(--ui-text-tertiary)', children: r.date }),
      jsx('span', { className: 'font-medium', children: r.side }),
      jsx('span', { children: r.ticker }),
      jsx('span', { className: retClass(r.excess), children: r.excess != null ? (r.excess >= 0 ? '+' : '') + r.excess.toFixed(2) + ' pts' : 'no data' }),
      jsx('span', { className: 'text-(--ui-text-tertiary)', children: r.status })
    ] }, r.id)) })
  ] })
}

function Positions({ rows }) {
  if (!rows || !rows.length) return jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'no positions' })
  const head = ['ticker', 'weight', 'value', 'price', 'basis', 'stop', 'trim', 'trend', 'rsi', 'status']
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
      techCell(p.ticker, 'trend', TECH),
      techCell(p.ticker, 'rsi14', TECH),
      jsx('td', { className: 'py-1', children: p.status === 'ok' ? jsx('span', { className: 'text-(--ui-text-tertiary)', children: 'ok' }) : jsx(Badge, { variant: 'destructive', children: p.status.toUpperCase() }) })
    ] }, p.ticker)) })
  ] })
}

function techCell(ticker, key, tech) {
  const row = (tech || {})[ticker] || {}
  return jsx('td', { className: 'py-1 pr-3 text-(--ui-text-tertiary)', children: row[key] != null ? String(row[key]) : '—' })
}

function TradeList({ title, trades }) {
  const rows = trades || []
  const items = rows.slice().reverse().map((t, i) => jsxs('li', { className: 'flex flex-col gap-0.5', children: [
    jsxs('div', { children: [
      jsx('span', { className: 'text-(--ui-text-tertiary)', children: t.date + ' ' }),
      t.side, ' ', jsx('span', { className: 'font-medium', children: t.ticker }),
      ' ', money(t.price), ' × ', t.shares
    ] }),
    t.rationale && jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: t.rationale })
  ] }, i))
  return jsxs('div', { className: 'flex min-w-0 flex-1 flex-col gap-1', children: [
    jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: title }),
    items.length
      ? jsx('ul', { className: 'flex flex-col gap-2 text-xs', children: items })
      : jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'none yet' })
  ] })
}

function NewsFeed({ rows }) {
  if (!rows || !rows.length) return null
  const byTicker = {}
  for (const r of rows) (byTicker[r.ticker] = byTicker[r.ticker] || []).push(r)
  return jsxs('div', { className: 'flex flex-col gap-2', children: [
    jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: 'News driving the calls' }),
    Object.entries(byTicker).map(([ticker, items]) => jsxs('div', { className: 'rounded-md border border-(--ui-stroke-secondary) p-3', children: [
      jsxs('div', { className: 'flex items-center gap-2', children: [
        jsx('span', { className: 'text-sm font-medium', children: ticker }),
        items[0].tone && jsx(Badge, {
          variant: items[0].tone === 'POSITIVE' ? 'default' : items[0].tone === 'NEGATIVE' ? 'destructive' : 'secondary',
          children: items[0].tone
        })
      ] }),
      jsx('ul', { className: 'mt-1 flex flex-col gap-1 text-xs text-(--ui-text-secondary)', children: items.map((h, i) => jsxs('li', { children: [
        h.date && jsx('span', { className: 'text-(--ui-text-tertiary)', children: h.date.slice(0, 10) + ' · ' }),
        h.publisher && jsx('span', { children: h.publisher + ' · ' }),
        jsx('span', { children: h.title }),
        h.events && jsx('span', { className: 'text-(--ui-accent)', children: ' [' + h.events + ']' })
      ] }, i)) })
    ] }, ticker))
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
  const TECH = data.technicals || {}
  return jsxs('div', { className: 'flex h-full flex-col gap-4 overflow-auto p-4 text-sm', children: [
    jsxs('div', { className: 'flex items-center gap-3', children: [
      jsx('div', { className: 'text-lg font-semibold', children: 'SoFi Command Center' }),
      jsx(Freshness, { iso: data.generated_at }),
      jsx(NextDeposit, { dep: data.next_deposit }),
      jsx('div', { className: 'ml-auto flex items-center gap-2 text-xs text-(--ui-text-tertiary)', children: 'account ' + money(data.account_value) + ' · cash ' + money(data.cash) }),
      jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => refetch(), children: 'Refresh' })
    ] }),
    jsxs('section', { className: 'flex flex-col gap-2', children: [
      jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: 'What to do now' }),
      jsx(Actions, { rows: data.actions })
    ] }),
    jsx(Scoreboard, { exp }),
    jsx(VerdictTape, { snapshots: exp.snapshots }),
    jsx(Scorecard, { rows: data.decision_scores }),
    jsx(Positions, { rows: data.positions }),
    jsx(NewsFeed, { rows: data.news_feed }),
    jsxs('div', { className: 'flex gap-6', children: [
      jsx(TradeList, { title: 'Book D — Diego guided', trades: exp.books && exp.books.D && exp.books.D.trades }),
      jsx(TradeList, { title: 'Book B — Bot rules', trades: exp.books && exp.books.B && exp.books.B.trades })
    ] }),
    data.events && data.events.length ? jsxs('div', { className: 'flex flex-col gap-1', children: [
      jsx('div', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Upcoming events' }),
      jsx('ul', { className: 'text-xs', children: data.events.map((e, i) => jsxs('li', { children: [
        jsx('span', { className: 'text-(--ui-text-tertiary)', children: e.date + ' ' }), e.ticker, ': ', e.event
      ] }, i)) })
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