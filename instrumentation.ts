/**
 * Next.js instrumentation hook — runs once when the server boots.
 * Used to resume any broadcasts that were mid-flight when the container died,
 * and to re-arm scheduled broadcasts whose fire time hasn't passed yet.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;

  try {
    const { resumeInFlightBroadcasts, resumeScheduledBroadcasts } = await import("./lib/broadcast-runner");
    // Stagger so DB doesn't get hit twice at the same instant
    setTimeout(() => {
      resumeInFlightBroadcasts().catch((e) => console.error("[instrumentation] resume in-flight:", e));
    }, 2_000);
    setTimeout(() => {
      resumeScheduledBroadcasts().catch((e) => console.error("[instrumentation] resume scheduled:", e));
    }, 4_000);
  } catch (e) {
    console.error("[instrumentation] register failed:", e);
  }
}
