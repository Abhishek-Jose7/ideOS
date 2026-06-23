export function workerStatus(worker, now = Date.now()) {
  if (within(worker.last_heartbeat, 90_000, now)) return 'active'
  if (within(worker.last_file_activity, 300_000, now)) return 'likely_active'
  if (within(worker.last_git_activity, 600_000, now)) return 'likely_active'
  return 'inactive'
}

export function statusMark(status) {
  if (status === 'active') return '●'
  if (status === 'likely_active') return '◑'
  return '○'
}

function within(value, ms, now) {
  if (!value) return false
  const time = new Date(value).getTime()
  return !Number.isNaN(time) && now - time < ms
}
