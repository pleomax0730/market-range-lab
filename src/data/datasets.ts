import { openDB } from 'idb'
import type { HistoryDataset } from '../domain/types'

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
  settingsVersion: 3
  candidate: string
  candidateSide: 'lower' | 'upper'
  horizon: number
  annualCapitalReturnRatePct: string
}

type PersistedDashboardSettings = Omit<DashboardSettings, 'settingsVersion' | 'annualCapitalReturnRatePct'> & {
  settingsVersion?: number
  annualCapitalReturnRatePct?: string
}

export function defaultDashboardSettings(): DashboardSettings {
  return {
    settingsVersion: 3,
    candidate: '',
    candidateSide: 'lower',
    horizon: 1,
    annualCapitalReturnRatePct: '10',
  }
}

export function normalizeDashboardSettings(settings: PersistedDashboardSettings): DashboardSettings {
  return {
    settingsVersion: 3,
    candidate: settings.candidate,
    candidateSide: settings.candidateSide,
    horizon: settings.horizon,
    annualCapitalReturnRatePct:
      settings.annualCapitalReturnRatePct !== undefined &&
      Number.isFinite(Number(settings.annualCapitalReturnRatePct)) &&
      Number(settings.annualCapitalReturnRatePct) >= 0
        ? settings.annualCapitalReturnRatePct
        : '10',
  }
}

export async function saveDashboardSettings(settings: DashboardSettings) {
  return (await database).put('settings', settings, 'dashboardSettings')
}

export async function getDashboardSettings(): Promise<PersistedDashboardSettings | undefined> {
  return (await database).get('settings', 'dashboardSettings')
}
