export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function rowsToCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
  return [headers.map(escape).join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n')
}

