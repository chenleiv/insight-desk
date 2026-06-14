const LEVELS = { error: 0, warn: 1, info: 2 };
const current = LEVELS[process.env.LOG_LEVEL ?? "info"] ?? LEVELS.info;

function fmt(level, msg, meta) {
  const ts = new Date().toISOString();
  const base = `${ts} [${level.toUpperCase()}] ${msg}`;
  return meta !== undefined ? `${base} ${JSON.stringify(meta)}` : base;
}

export const logger = {
  error(msg, meta) { if (current >= LEVELS.error) console.error(fmt("error", msg, meta)); },
  warn(msg, meta)  { if (current >= LEVELS.warn)  console.warn(fmt("warn", msg, meta));  },
  info(msg, meta)  { if (current >= LEVELS.info)  console.log(fmt("info", msg, meta));   },
};
