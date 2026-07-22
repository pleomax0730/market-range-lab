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
  cash: string
  multiple: string
  obligation: string
  candidate: string
  candidateSide: 'lower' | 'upper'
  horizon: number
}

export function defaultDashboardSettings(): DashboardSettings {
  return {
    cash: '60000',
    multiple: '1.2',
    obligation: '0',
    candidate: '',
    candidateSide: 'lower',
    horizon: 1,
  }
}

export async function saveDashboardSettings(settings: DashboardSettings) {
  return (await database).put('settings', settings, 'dashboardSettings')
}

export async function getDashboardSettings(): Promise<DashboardSettings | undefined> {
  return (await database).get('settings', 'dashboardSettings')
}
