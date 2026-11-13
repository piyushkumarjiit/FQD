import React, { useState } from 'react';
import type { Account } from '../../api';
import { href, go } from '../../route';
import { useUsage } from '../Usage/useUsage';
import { quotaWindows } from '../common/cpaUiUtils';
import {
  Badge,
  CloseIcon,
  Dot,
  STATUS_COLOR,
  bindingOf,
  familyOf,
  fmtCompact,
  fmtSpend,
  levelColor,
  levelsOf,
  providerColor,
  reasonOf,
  slotOf,
  statusOf,
  untilText,
  Meter,
  type PanelData,
} from '../common/bits';

const DISMISS_KEY = 'fqd.dismissedExhausted';
const DISMISSED_TOS_KEY = 'fqd.dismissedTos';

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function readDismissedTos(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_TOS_KEY);
  } catch {
    return null;
  }
}

const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

function getBatteryColor(st: 'healthy' | 'exhausted' | 'cooldown' | 'tos', remainingPercent: number): string {
  if (st === 'tos') return 'var(--tos)';
  if (st === 'cooldown') return 'var(--cool)';
  if (remainingPercent <= 2) return 'var(--bad)';
  if (remainingPercent <= 20) return 'var(--warn)';
  return 'var(--ok)';
}

/** The one screen to check: anything wrong, how much room is left, and where. */
export const Overview: React.FC<{ data: PanelData; openAccount: (id: string) => void; refreshKey: number }> = ({ data, openAccount, refreshKey }) => {
  const { accounts } = data;
  const usage = useUsage(7, refreshKey);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [dismissedTos, setDismissedTos] = useState(readDismissedTos);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const status = (a: Account) => statusOf(data, a);
  const live = accounts.filter((a) => status(a) !== 'cooldown' && status(a) !== 'tos');
  const win = (a: Account) => quotaWindows(a);
  const withFive = live.filter((a) => win(a).fiveHour);
  const withWeek = live.filter((a) => win(a).weekly);
  const five = avg(withFive.map((a) => win(a).fiveHour!.remaining));
  const week = avg(withWeek.map((a) => win(a).weekly!.remaining));
  const low5 = [...withFive].sort((a, b) => win(a).fiveHour!.remaining - win(b).fiveHour!.remaining)[0];
  const lowW = [...withWeek].sort((a, b) => win(a).weekly!.remaining - win(b).weekly!.remaining)[0];

  // Banner: exhausted accounts only, dismissible until the set of exhausted accounts changes.
  const exhausted = accounts.filter((a) => status(a) === 'exhausted');
  const exhKey = exhausted.map((a) => a.id).sort().join(',');
  const nextBack = [...exhausted]
    .filter((a) => bindingOf(a)?.resetsAt)
    .sort((a, b) => new Date(bindingOf(a)!.resetsAt!).getTime() - new Date(bindingOf(b)!.resetsAt!).getTime())[0];
  const dismiss = () => {
    setDismissed(exhKey);
    try {
      sessionStorage.setItem(DISMISS_KEY, exhKey);
    } catch {}
  };

  // Top Alert Strip: TOS flagged accounts, dismissible for the browser session.
  const tosAccounts = accounts.filter((a) => status(a) === 'tos');
  const tosKey = tosAccounts.map((a) => a.id).sort().join(',');
  const dismissTos = () => {
    setDismissedTos(tosKey);
    try {
      sessionStorage.setItem(DISMISSED_TOS_KEY, tosKey);
    } catch {}
  };

  // One row per provider family seen in accounts or LiteLLM usage; nothing hardcoded.
  const families = new Map<string, { accounts: Account[]; requests: number; spend: number }>();
  const fam = (f: string) => families.get(f) ?? families.set(f, { accounts: [], requests: 0, spend: 0 }).get(f)!;
  for (const a of accounts) fam(familyOf(a)).accounts.push(a);
  for (const f of usage?.connected ? usage.families : []) {
    const g = fam(f.family);
    g.requests = f.requests;
    g.spend = f.spend;
  }
  const groups = [...families.entries()].sort(
    ([an, a], [bn, b]) => b.accounts.length - a.accounts.length || b.spend - a.spend || an.localeCompare(bn)
  );

  const attention = accounts
    .filter((a) => status(a) === 'exhausted' || status(a) === 'tos')
    .sort((a, b) => (bindingOf(a)?.remaining ?? 100) - (bindingOf(b)?.remaining ?? 100));

  const operationalCount = accounts.filter((a) => status(a) === 'healthy').length;
  const claudeCount = accounts.filter((a) => a.providerType === 'claude').length;
  const tosCount = tosAccounts.length;
  const famCounts = groups.filter(([, g]) => g.accounts.length).map(([n, g]) => `${g.accounts.length} ${n}`).join(' · ');
  const accountsSub = accounts.length
    ? `${operationalCount} operational · ${claudeCount ? `${claudeCount} Claude · ` : ''}${tosCount ? `${tosCount} TOS` : famCounts}`
    : 'No accounts yet';

  const tile = (lbl: string, val: React.ReactNode, sub: string, link: string, color?: string) => (
    <a className="card tile drill" href={link}>
      <span className="lbl">{lbl}</span>
      <span className="val" style={{ color: color ?? 'var(--text)' }}>{val}</span>
      <span className="sub">{sub}</span>
      <span className="tile-link">Details</span>
    </a>
  );
  const pro = data.levels.pro;

  return (
    <>
      {tosAccounts.length > 0 && dismissedTos !== tosKey && (
        <div
          className="card status-strip"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: 'var(--tos-soft)',
            border: '1px solid var(--tos-border)',
            borderLeft: '5px solid var(--tos)',
            borderRadius: 'var(--radius)',
            padding: '12px 16px',
            marginBottom: 18,
            fontSize: 13,
          }}
        >
          <a
            className="drill"
            href={href('accounts', { status: 'tos', from: 'overview' })}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--tos)' }}>
              {tosAccounts.length} account{tosAccounts.length > 1 ? 's' : ''} restricted · Google 403 TOS notice
            </div>
            <div className="muted small">
              Appeal submitted. Routing &amp; quota polling paused in cooldown to protect account{tosAccounts.length > 1 ? 's' : ''}.
            </div>
          </a>
          <button
            className="icon-btn"
            title="Dismiss"
            aria-label="Dismiss warning"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={dismissTos}
          >
            ✕
          </button>
        </div>
      )}

      {exhausted.length > 0 && dismissed !== exhKey && (
        <div className="card status-strip">
          <a className="status-main drill" href={href('accounts', { status: 'exhausted', from: 'overview' })}>
            <span>
              <div className="status-title">
                {exhausted.length} account{exhausted.length > 1 ? 's are' : ' is'} exhausted
              </div>
              <div className="muted small">
                Callers routed to {exhausted.length > 1 ? 'them' : 'it'} may get 429 errors.
                {nextBack && ` Next one back: ${nextBack.name} in ${untilText(bindingOf(nextBack)!.resetsAt)}.`}
              </div>
            </span>
          </a>
          <button className="icon-btn" title="Dismiss" aria-label="Dismiss warning" onClick={dismiss}>
            <CloseIcon />
          </button>
        </div>
      )}

      <div className="tiles">
        {tile('Accounts', accounts.length, accountsSub, href('accounts', { from: 'overview' }))}
        {tile(
          '5-hour quota',
          five === null ? '-' : `${five}%`,
          low5 ? `Active pool avg · lowest ${low5.name} at ${Math.round(win(low5).fiveHour!.remaining)}%` : 'No 5-hour windows reported',
          href('accounts', { sort: 'fiveHour', dir: 'asc', from: 'overview' }),
          levelColor(five, pro)
        )}
        {tile(
          'Weekly quota',
          week === null ? '-' : `${week}%`,
          lowW ? (tosCount > 0 ? `Active pool avg · ${tosCount} TOS accounts excluded` : `Active pool avg · lowest ${lowW.name} at ${Math.round(win(lowW).weekly!.remaining)}%`) : 'No weekly windows reported',
          href('accounts', { sort: 'weekly', dir: 'asc', from: 'overview' }),
          levelColor(week, pro)
        )}
        {usage?.connected
          ? tile(
              'Usage · 7 days',
              `${fmtCompact(usage.totals.requests)} req`,
              `${fmtSpend(usage.totals.spend)} spend · ${usage.totals.requests ? ((usage.totals.failed / usage.totals.requests) * 100).toFixed(1) : '0.0'}% failed`,
              href('usage', { range: 7, from: 'overview' })
            )
          : tile('Usage', 'Not connected', 'Connect LiteLLM to see requests and spend', href('settings', { focus: 'litellm' }), 'var(--muted)')}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Headroom by provider</h2>
          <div className="legend">
            {(['healthy', 'exhausted', 'cooldown', 'tos'] as const).map((s) => (
              <span key={s}><Dot color={STATUS_COLOR[s]} />{s === 'tos' ? 'TOS' : s[0].toUpperCase() + s.slice(1)}</span>
            ))}
            <span>· bar = tightest limit</span>
          </div>
        </div>
        {groups.length === 0 && <div className="card muted small">Headroom appears here once accounts report quota.</div>}
        {groups.map(([name, g]) => {
          const accs = g.accounts;
          const open = Boolean(expanded[name]) && accs.length > 0;
          const h = avg(accs.filter((a) => status(a) !== 'cooldown' && status(a) !== 'tos').map((a) => bindingOf(a)?.remaining).filter((v): v is number => typeof v === 'number'));
          const attn = accs.filter((a) => status(a) === 'exhausted' || status(a) === 'tos').length;
          const color = accs[0] ? providerColor(accs[0].providerType) : 'var(--muted)';
          const usageLink = href('usage', { family: name, range: 7, from: 'overview' });
          const onRow = () => (accs.length ? setExpanded((e) => ({ ...e, [name]: !e[name] })) : go('usage', { family: name, from: 'overview' }));
          return (
            <div className="prov" key={name}>
              <div className="prov-head" role="button" tabIndex={0} onClick={onRow} onKeyDown={(e) => (e.key === 'Enter' ? onRow() : undefined)}>
                <div className="prov-name">
                  <Dot color={color} />
                  <div>
                    <strong>{name}</strong>
                    <div className="muted small">
                      {accs.length ? `${accs.length} account${accs.length > 1 ? 's' : ''}` : 'usage only'}
                      {attn > 0 && <span style={{ color: 'var(--warn)' }}> · {attn} need{attn > 1 ? '' : 's'} attention</span>}
                    </div>
                  </div>
                </div>
                {h !== null ? (
                  <span style={{ fontWeight: 700, color: levelColor(h, pro) }} title="Average remaining in each account's tightest window">
                    {h}%
                  </span>
                ) : <span />}
                {accs.length ? (
                  <div className="segs">
                    {accs.map((a) => {
                      const b = bindingOf(a);
                      const st = status(a);
                      const rem = b?.remaining ?? 0;
                      const fillColor = getBatteryColor(st, rem);
                      return (
                        <button
                          key={a.id}
                          className="seg"
                          title={`${a.name} · ${st}${b ? ` · ${b.label} ${b.remaining}%` : ''}`}
                          aria-label={`Open ${a.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openAccount(a.id);
                          }}
                        >
                          <i style={{ height: `${Math.max(rem, 6)}%`, background: fillColor }} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="muted small">No FQD accounts · routed directly by LiteLLM</span>
                )}
                <div className="prov-usage">
                  {g.requests ? (
                    <>
                      <a href={usageLink} onClick={(e) => e.stopPropagation()}>
                        {fmtCompact(g.requests)} req · {fmtSpend(g.spend)}
                      </a>
                      <div className="muted small">last 7 days</div>
                    </>
                  ) : (
                    <span className="muted small">no usage</span>
                  )}
                </div>
                <span className="toggle-txt">{accs.length ? (open ? 'Hide' : 'Show') : 'Usage'}</span>
              </div>
              {open && (
                <div className="prov-body">
                  {accs.map((a) => {
                    const w = win(a);
                    return (
                      <div className="mini-row" key={a.id} role="button" tabIndex={0} onClick={() => openAccount(a.id)} onKeyDown={(e) => (e.key === 'Enter' ? openAccount(a.id) : undefined)}>
                        <span>{a.name}<span className="muted small"> · slot {slotOf(data, a)}</span></span>
                        <span className="hide-sm"><Meter value={w.fiveHour?.remaining} levels={levelsOf(data, a)} /></span>
                        <span className="hide-sm"><Meter value={w.weekly?.remaining} levels={levelsOf(data, a)} /></span>
                        <span><Badge status={status(a)} /></span>
                      </div>
                    );
                  })}
                  <div className="mini-foot">
                    <a className="link" href={href('accounts', { provider: name, from: 'overview' })}>Open {accs.length} {name} accounts in Accounts</a>
                    {g.requests > 0 && <a className="link" href={usageLink}>See {name} usage</a>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Needs attention</h2>
          {attention.length > 0 && (
            <a className="link" href={href('accounts', { status: 'attention', from: 'overview' })}>View all {attention.length} in Accounts</a>
          )}
        </div>
        {attention.length === 0 ? (
          <div className="card muted small">Nothing needs attention right now.</div>
        ) : (
          <div className="card" style={{ padding: 6 }}>
            {(['exhausted', 'tos'] as const).map((st) => {
              const xs = attention.filter((a) => status(a) === st);
              if (!xs.length) return null;
              return (
                <React.Fragment key={st}>
                  <div className="attn-group" style={{ color: STATUS_COLOR[st] }}>
                    {st === 'exhausted' ? 'Exhausted' : 'TOS Restriction'}
                    <span>{st === 'exhausted' ? 'Out of quota. Callers routed here may get 429s' : 'Google 403 TOS notice. Polling paused to protect account'}</span>
                  </div>
                  {xs.map((a) => (
                    <div className="attn-item drill" key={a.id} role="button" tabIndex={0} onClick={() => openAccount(a.id)} onKeyDown={(e) => (e.key === 'Enter' ? openAccount(a.id) : undefined)}>
                      <span><Badge status={st} /></span>
                      <span>
                        <strong>{a.name}</strong>
                        <div className="muted small"><Dot color={providerColor(a.providerType)} /> {familyOf(a)} · slot {slotOf(data, a)}</div>
                      </span>
                      <span className="small">{reasonOf(data, a)}</span>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
};
