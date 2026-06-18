export function useCloudBackend() {
  return process.env.SCAR_BACKEND === 'cloud'
}

export function cloudUrl() {
  return process.env.SCAR_WORKSPACE_URL || process.env.SCAR_CLOUD_URL || ''
}

export async function cloudCall(path, { method = 'GET', body } = {}) {
  const base = cloudUrl()
  if (!base) throw new Error('SCAR_BACKEND=cloud requires SCAR_WORKSPACE_URL.')
  const response = await fetch(new URL(path, base), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!response.ok) throw new Error(`Cloud backend ${response.status}: ${await response.text()}`)
  return response.json()
}
