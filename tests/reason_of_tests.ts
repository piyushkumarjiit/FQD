/**
 * Unit tests for UI status reasoning (reasonOf in bits.tsx).
 * Ensures honest, contradictory-free status explanations for tight and exhausted accounts,
 * specifically preventing "X at 48%, at or below 20%" bugs when multi-window or predictive
 * tripwires trigger tight/exhausted state.
 */
import { reasonOf, type PanelData } from '../web/src/components/common/bits';
import type { Account } from '../web/src/api';
import { DEFAULT_STATUS_LEVELS } from '../src/constants/statusLevels';
import type { WatermarkAccountView, WatermarkFleetOverview } from '../server/src/cpaWatermarkTypes';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, extraInfo?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${testName} ${extraInfo ? `-> ${extraInfo}` : ''}`);
  }
}

console.log('======================================================');
console.log('  REASON OF (UI STATUS EXPLANATIONS) TESTS            ');
console.log('======================================================\n');

function makeAccount(id: string, name: string, geminiRemaining: number, secondaryRemaining?: number): Account {
  const buckets: any[] = [
    {
      id: 'gemini-weekly',
      windowType: 'weekly_7d',
      label: 'Gemini · Weekly',
      remainingPercent: geminiRemaining,
      resetsAt: '2026-11-20T12:00:00Z',
      details: { family: 'gemini' },
    },
  ];
  if (secondaryRemaining !== undefined) {
    buckets.push({
      id: '3p-weekly',
      windowType: 'weekly_7d',
      label: 'Claude and GPT models',
      remainingPercent: secondaryRemaining,
      resetsAt: '2026-11-20T12:00:00Z',
      details: { family: '3p' },
    });
  }

  return {
    id,
    name,
    email: `${name}@example.com`,
    providerType: 'antigravity',
    isActive: true,
    plan: 'Pro',
    orderIndex: 0,
    lastStatus: 'ok',
    createdAt: '2026-11-01T00:00:00Z',
    latestSnapshot: {
      accountId: id,
      providerType: 'antigravity',
      status: 'ok',
      planName: 'Pro',
      fetchedAt: new Date().toISOString(),
      buckets,
    },
  };
}

function makePanelData(accounts: Account[], views: WatermarkAccountView[]): PanelData {
  const overview: WatermarkFleetOverview = {
    mode: 'enforce',
    routingStrategy: 'weighted-round-robin',
    writesBlockedReason: null,
    tierState: 'OPEN',
    poolRunwayMinutes: 120,
    healthyCount: accounts.length,
    tightCount: 0,
    exhaustedCount: 0,
    quarantinedCount: 0,
    activeDangerAlerts: [],
    recentShadowDecisions: [],
    accounts: views,
  };

  return {
    accounts,
    overview,
    telemetry: null,
    levels: DEFAULT_STATUS_LEVELS,
    gateways: { cliproxyUrl: 'http://localhost:8317', litellmUrl: 'http://localhost:4000' },
    intervalMin: 1,
    telegram: false,
  };
}

// Suite 1: Honest TOS appeal reasoning
console.log('Suite 1: Honest TOS appeal reasoning');
{
  const acc = makeAccount('acc-tos-1', 'slot-01', 100);
  acc.latestSnapshot!.status = 'quarantined';
  acc.latestSnapshot!.errorMessage = 'Google 403 TOS notice · Appeal submitted';
  const view: WatermarkAccountView = {
    accountId: 'acc-tos-1',
    name: 'slot-01',
    provider: 'antigravity',
    state: 'quarantined',
    manualHold: 'none',
    currentWeight: 0,
    targetWeight: 0,
    readBackDrift: false,
    isQuarantined: true,
    isDisabled: true,
    bindingWindow: 'weekly_7d',
    windows: [],
    burnRatePerMin: 0,
    runwayMinutes: null,
    recentRequests5m: 0,
    recentErrors15m: { http429: 0, http5xx: 0 },
    reason: 'Google 403 TOS notice · Appeal submitted',
  };

  const data = makePanelData([acc], [view]);
  const reason = reasonOf(data, acc);
  assert(reason.includes('Google 403 TOS notice · Appeal submitted. Polling paused in cooldown to protect account.'), 'Outputs honest TOS appeal text');
}

// Suite 2: Healthy account reasoning
console.log('\nSuite 2: Healthy account reasoning');
{
  const acc = makeAccount('acc-2', 'slot-09', 48, 85);
  const view: WatermarkAccountView = {
    accountId: 'acc-2',
    name: 'slot-09',
    provider: 'antigravity',
    state: 'healthy',
    manualHold: 'none',
    currentWeight: 100,
    targetWeight: 100,
    readBackDrift: false,
    isQuarantined: false,
    isDisabled: false,
    bindingWindow: 'weekly_7d',
    windows: [
      {
        key: 'gemini-weekly',
        label: 'Gemini · Weekly',
        currentRemainingPct: 48,
        projectedRemainingPct: 48,
        resetsAt: '2026-11-20T12:00:00Z',
        resetSecondsRemaining: 3600,
        isBinding: true,
      },
    ],
    burnRatePerMin: 0,
    runwayMinutes: null,
    recentRequests5m: 0,
    recentErrors15m: { http429: 0, http5xx: 0 },
  };

  const data = makePanelData([acc], [view]);
  const reason = reasonOf(data, acc);
  assert(reason.includes('Lowest quota: Gemini · Weekly at 48%.'), 'Correctly attributes healthy state to lowest quota');
}

// Suite 3: Cooldown account reasoning
console.log('\nSuite 3: Cooldown account reasoning');
{
  const acc = makeAccount('acc-3', 'slot-06', 75);
  const view: WatermarkAccountView = {
    accountId: 'acc-3',
    name: 'slot-06',
    provider: 'antigravity',
    state: 'airgapped',
    manualHold: 'airgap',
    currentWeight: 0,
    targetWeight: 0,
    readBackDrift: false,
    isQuarantined: true,
    isDisabled: true,
    bindingWindow: 'weekly_7d',
    windows: [],
    burnRatePerMin: 0,
    runwayMinutes: null,
    recentRequests5m: 0,
    recentErrors15m: { http429: 0, http5xx: 0 },
  };

  const data = makePanelData([acc], [view]);
  const reason = reasonOf(data, acc);
  assert(reason.includes('Taken out of rotation by an admin. Not receiving traffic.'), 'Correctly explains admin cooldown hold');
}

// Suite 4: Rate-limited account
console.log('\nSuite 4: Rate-limited account');
{
  const acc = makeAccount('acc-4', 'slot-02', 80);
  acc.latestSnapshot!.status = 'rate_limited';
  const data = makePanelData([acc], []);
  const reason = reasonOf(data, acc);
  assert(reason.includes('The provider is rate-limiting this account, so callers may get 429 errors.'), 'Explains rate limited status cleanly');
}

// Suite 5: Exhausted handling when displayed window > 2%
console.log('\nSuite 5: Exhausted with secondary window breached or predictive');
{
  const acc = makeAccount('acc-5', 'slot-05', 50, 0);
  const view: WatermarkAccountView = {
    accountId: 'acc-5',
    name: 'slot-05',
    provider: 'antigravity',
    state: 'exhausted',
    manualHold: 'none',
    currentWeight: 0,
    targetWeight: 0,
    readBackDrift: false,
    isQuarantined: false,
    isDisabled: false,
    bindingWindow: '3p-weekly',
    windows: [
      {
        key: 'gemini-weekly',
        label: 'Gemini · Weekly',
        currentRemainingPct: 50,
        projectedRemainingPct: 50,
        resetsAt: '2026-11-20T12:00:00Z',
        resetSecondsRemaining: 3600,
        isBinding: false,
      },
      {
        key: '3p-weekly',
        label: 'Claude and GPT models',
        currentRemainingPct: 0,
        projectedRemainingPct: 0,
        resetsAt: '2026-11-20T12:00:00Z',
        resetSecondsRemaining: 3600,
        isBinding: true,
      },
    ],
    burnRatePerMin: 0,
    runwayMinutes: null,
    recentRequests5m: 0,
    recentErrors15m: { http429: 0, http5xx: 0 },
  };

  const data = makePanelData([acc], [view]);
  const reason = reasonOf(data, acc);
  assert(!reason.includes('50%, at or below'), 'Does NOT claim 50% is at or below 2%');
  assert(reason.includes('Claude and GPT models at 0%, at or below the policy hard stop (2%)'), 'Correctly attributes exhaustion to 0% Claude/GPT window');
}

console.log('\n======================================================');
console.log(`SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('======================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
