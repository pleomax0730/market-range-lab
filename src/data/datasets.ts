import { openDB } from 'idb'
import type { HistoryDataset } from '../domain/types'

const database = openDB('market-range-dashboard', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('datasets')) db.createObjectStore('datasets', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
  },
})

export async function saveDataset(dataset: HistoryDataset) {
  return (await database).put('datasets', dataset)
}

export async function listDatasets(): Promise<HistoryDataset[]> {
  return (await database).getAll('datasets')
}

export async function deleteDataset(id: string) {
  return (await database).delete('datasets', id)
}

export async function clearDatasets() {
  return (await database).clear('datasets')
}

export async function setActiveDataset(id: string) {
  return (await database).put('settings', id, 'activeDataset')
}

export async function getActiveDatasetId(): Promise<string | undefined> {
  return (await database).get('settings', 'activeDataset')
}

