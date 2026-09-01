export const globalLogs: string[] = [];
const MAX_LOGS = 30;

function addLog(msg: string) {
  globalLogs.push(msg);
  if (globalLogs.length > MAX_LOGS) {
    globalLogs.shift();
  }
}

export function setupLogger() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => {
    const ts = new Date().toLocaleTimeString("uz-UZ", { hour12: false });
    const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ");
    addLog(`[${ts}] ℹ️ ${msg}`);
    originalLog.apply(console, args);
  };

  console.warn = (...args) => {
    const ts = new Date().toLocaleTimeString("uz-UZ", { hour12: false });
    const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ");
    addLog(`[${ts}] ⚠️ ${msg}`);
    originalWarn.apply(console, args);
  };

  console.error = (...args) => {
    const ts = new Date().toLocaleTimeString("uz-UZ", { hour12: false });
    const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ");
    addLog(`[${ts}] ❌ ${msg}`);
    originalError.apply(console, args);
  };
}
