import { openDB } from 'idb'
import type { HistoryDataset } from '../domain/types'
import {
  DEFAULT_RECOVERY_FRONTIER_SETTINGS,
  type RecoveryFrontierSettings,
} from '../domain/candidate-recovery'

const database = openDB('market-range-dashboard', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('datasets')) db.createObjectStore('datasets', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
  },
})

export async function saveDatasetAndSelect(dataset: HistoryDataset, activeId: string) {
  const db = await database
  const transaction = db.transaction(['datasets', 'settings'], 'readwrite')
  await Promise.all([
    transaction.objectStore('datasets').put(dataset),
    transaction.objectStore('settings').put(activeId, 'activeDataset'),
    transaction.done,
  ])
}

export async function listDatasets(): Promise<HistoryDataset[]> {
  return (await database).getAll('datasets')
}

export async function deleteDatasetAndSetActive(id: string, activeId: string) {
  const db = await database
  const transaction = db.transaction(['datasets', 'settings'], 'readwrite')
  await Promise.all([
    transaction.objectStore('datasets').delete(id),
    activeId
      ? transaction.objectStore('settings').put(activeId, 'activeDataset')
      : transaction.objectStore('settings').delete('activeDataset'),
    transaction.done,
  ])
}

export async function clearDatasets() {
  const db = await database
  const transaction = db.transaction(['datasets', 'settings'], 'readwrite')
  await Promise.all([
    transaction.objectStore('datasets').clear(),
    transaction.objectStore('settings').delete('activeDataset'),
    transaction.done,
  ])
}

export async function setActiveDataset(id: string) {
  return (await database).put('settings', id, 'activeDataset')
}

export async function getActiveDatasetId(): Promise<string | undefined> {
  return (await database).get('settings', 'activeDataset')
}

export type DashboardSettings = {
  settingsVersion: 6
  candidate: string
  candidateSide: 'lower' | 'upper'
  expiryDate: string
  aggressiveExpirationRiskPct: string
  aggressiveTouchRiskPct: string
  annualCapitalReturnRatePct: string
  recoveryThroughDate: string
  recoveryFrontierSettings: RecoveryFrontierSettings
}

type PersistedDashboardSettings = Partial<Omit<DashboardSettings, 'settingsVersion'>> & {
  settingsVersion?: number
  aggressiveExpirationRiskPct?: string
  aggressiveTouchRiskPct?: string
  annualCapitalReturnRatePct?: string
  horizon?: number
  recoveryThroughDate?: string
  recoveryFrontierSettings?: Partial<RecoveryFrontierSettings>
}

export function defaultDashboardSettings(): DashboardSettings {
  return {
    settingsVersion: 6,
    candidate: '',
    candidateSide: 'lower',
    expiryDate: '',
    aggressiveExpirationRiskPct: '5',
    aggressiveTouchRiskPct: '10',
    annualCapitalReturnRatePct: '10',
    recoveryThroughDate: '',
    recoveryFrontierSettings: { ...DEFAULT_RECOVERY_FRONTIER_SETTINGS },
  }
}

function finiteOr(value: unknown, fallback: number) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function normalizeRecoveryFrontierSettings(
  settings: Partial<RecoveryFrontierSettings> | undefined,
): RecoveryFrontierSettings {
  const defaults = DEFAULT_RECOVERY_FRONTIER_SETTINGS
  return {
    target: 'strike',
    deadlineIndex: Math.min(3, Math.max(0, Math.round(finiteOr(settings?.deadlineIndex, defaults.deadlineIndex)))),
    minimumRecoveryRate: Math.min(1, Math.max(0, finiteOr(settings?.minimumRecoveryRate, defaults.minimumRecoveryRate))),
    minimumLower95: Math.min(1, Math.max(0, finiteOr(settings?.minimumLower95, defaults.minimumLower95))),
    minimumEffectiveAssignments: Math.max(0, finiteOr(settings?.minimumEffectiveAssignments, defaults.minimumEffectiveAssignments)),
    minimumMoneyness: Math.min(1, Math.max(0.1, finiteOr(settings?.minimumMoneyness, defaults.minimumMoneyness))),
    maximumMoneyness: Math.min(1, Math.max(0.1, finiteOr(settings?.maximumMoneyness, defaults.maximumMoneyness))),
    stepMoneyness: Math.min(0.1, Math.max(0.001, finiteOr(settings?.stepMoneyness, defaults.stepMoneyness))),
  }
}

export function normalizeDashboardSettings(settings: PersistedDashboardSettings): DashboardSettings {
  return {
    settingsVersion: 6,
    candidate: settings.candidate ?? '',
    candidateSide: settings.candidateSide === 'upper' ? 'upper' : 'lower',
    expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(settings.expiryDate ?? '') ? settings.expiryDate! : '',
    aggressiveExpirationRiskPct: settings.aggressiveExpirationRiskPct ?? '5',
    aggressiveTouchRiskPct: settings.aggressiveTouchRiskPct ?? '10',
    annualCapitalReturnRatePct:
      settings.annualCapitalReturnRatePct !== undefined &&
      Number.isFinite(Number(settings.annualCapitalReturnRatePct)) &&
      Number(settings.annualCapitalReturnRatePct) >= 0
        ? settings.annualCapitalReturnRatePct
        : '10',
    recoveryThroughDate: /^\d{4}-\d{2}-\d{2}$/.test(settings.recoveryThroughDate ?? '')
      ? settings.recoveryThroughDate!
      : '',
    recoveryFrontierSettings: normalizeRecoveryFrontierSettings(
      settings.recoveryFrontierSettings,
    ),
  }
}

export async function saveDashboardSettings(settings: DashboardSettings) {
  return (await database).put('settings', settings, 'dashboardSettings')
}

export async function getDashboardSettings(): Promise<PersistedDashboardSettings | undefined> {
  return (await database).get('settings', 'dashboardSettings')
}
