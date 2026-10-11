export function createId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

let lastTimestampMs = 0;

/**
 * 严格递增的时间戳：保证同一毫秒内的连续写入也得到不同的 updatedAt，
 * 避免「创建即修改」时时间戳相同时序判断失真。
 */
export function nextTimestamp(): string {
  const current = Date.now();
  lastTimestampMs = current > lastTimestampMs ? current : lastTimestampMs + 1;
  return new Date(lastTimestampMs).toISOString();
}
