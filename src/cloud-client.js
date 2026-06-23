export function useCloudBackend() {
  return process.env.IDEOS_BACKEND === 'cloud'
}

export function cloudUrl() {
  return process.env.IDEOS_WORKSPACE_URL || process.env.IDEOS_CLOUD_URL || ''
}

export async function cloudCall(path, { method = 'GET', body } = {}) {
  const base = cloudUrl()
  if (!base) throw new Error('IDEOS_BACKEND=cloud requires IDEOS_WORKSPACE_URL.')
  const response = await fetch(new URL(path, base), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!response.ok) throw new Error(`Cloud backend ${response.status}: ${await response.text()}`)
  return response.json()
}
