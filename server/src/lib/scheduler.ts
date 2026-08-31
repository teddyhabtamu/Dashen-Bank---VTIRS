import cron from "node-cron";

// Simple in-process job registry with a running guard so a long job never
// overlaps itself. Because VTIRS runs as a single process, this is sufficient
// to prevent duplicate concurrent executions of the same background job.
const running = new Map<string, boolean>();

export async function runScheduledJob(name: string, fn: () => Promise<void>): Promise<void> {
  if (running.get(name)) {
    console.warn(`[scheduler] skipping ${name}: previous run still in progress`);
    return;
  }
  running.set(name, true);
  const started = Date.now();
  try {
    await fn();
  } catch (err) {
    console.error(`[scheduler] ${name} failed:`, err);
  } finally {
    running.set(name, false);
    console.log(`[scheduler] ${name} finished in ${Date.now() - started}ms`);
  }
}

// expression: standard cron expression (5 fields: minute hour dom month dow).
export function schedule(cronExpression: string, name: string, fn: () => Promise<void>) {
  if (!cron.validate(cronExpression)) {
    throw new Error(`[scheduler] invalid cron expression for "${name}": ${cronExpression}`);
  }
  cron.schedule(cronExpression, () => {
    // node-cron fires on a fixed clock; avoid overlapping if a run is slow.
    runScheduledJob(name, fn);
  });
  console.log(`[scheduler] scheduled "${name}" at cron "${cronExpression}"`);
}
