'use server'
import { Redis } from '@upstash/redis'
import challengesData from "../data/challenges.json";

const kv = Redis.fromEnv()

// ── helpers ──────────────────────────────────────────────────────────────────

function getManilaDateString(): string {
  const target = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns the challenge index (and therefore which challenge) for any given date */
function getChallengeForDate(dateStr: string) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = Math.imul(31, hash) + dateStr.charCodeAt(i) | 0;
  }
  return challengesData[Math.abs(hash) % challengesData.length];
}

/** Returns an ISO date string (YYYY-MM-DD) shifted by `days` relative to Manila today */
function manilaDateOffset(days: number): string {
  // Get current UTC ms, add Manila offset (+8h), then add day offset
  const utcNow = Date.now();
  const manilaOffset = 8 * 60 * 60 * 1000;
  const target = new Date(utcNow + manilaOffset + days * 86400000);
  // Format as YYYY-MM-DD from the UTC values of the shifted date
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface WeekDay {
  dateStr: string;          // "YYYY-MM-DD"
  label: string;            // "March 16"
  challengeId: number;
  questionName: string;     // challenge.question
  difficulty: string;
  stats: {
    totalUsers: number;
    solved: number;
    failed: number;
    solvedWithHint: number;
    solvedWithoutHint: number;
    attemptsDist: number[];
  };
  /** null = not participating, true = solved, false = failed */
  userResult: boolean | null;
}

// ── exported actions ──────────────────────────────────────────────────────────

/**
 * Returns the last 7 days (up to and including today) as WeekDay objects.
 * Days that haven't happened yet are excluded.
 * Duplicate challenges (same id) are de-duplicated so each question appears at most once.
 */
export async function getWeeklyRecapAction(
  userId: string,
  cachedResults: Record<string, boolean | null> = {}
): Promise<WeekDay[]> {
  const nowManila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const dayOfWeek = nowManila.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : -(dayOfWeek - 1); // Monday = start

  const days: WeekDay[] = [];
  const seenIds = new Set<number>();

  for (let offset = mondayOffset; offset <= 0; offset++) {
    const dateStr = manilaDateOffset(offset);
    const challenge = getChallengeForDate(dateStr);

    // Skip duplicates
    if (seenIds.has(challenge.id)) continue;
    seenIds.add(challenge.id);

    // Format label e.g. "March 16"
    const [year, month, day] = dateStr.split('-').map(Number);
    const label = new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });

    // Pull stats from Redis
    const [totalUsers, solved, failed, solvedWithHint, solvedWithoutHint, ...attemptCounts] = await Promise.all([
      kv.scard(`daily_stats:${dateStr}:users`).catch(() => 0),
      kv.get(`daily_stats:${dateStr}:solved`).catch(() => 0),
      kv.get(`daily_stats:${dateStr}:failed`).catch(() => 0),
      kv.get(`daily_stats:${dateStr}:solved_with_hint`).catch(() => 0),
      kv.get(`daily_stats:${dateStr}:solved_without_hint`).catch(() => 0),
      ...([1,2,3,4,5].map(i => kv.get(`daily_stats:${dateStr}:attempts:${i}`).catch(() => 0))),
    ]);

    const attemptsDist = attemptCounts.map(Number);

    // Did this user participate?
    let userResult: boolean | null = null;
      if (dateStr in cachedResults) {
        userResult = cachedResults[dateStr];
      } else {
        // fall back to Redis check
        const solveVal = await kv.get(`solved:${dateStr}:${userId}`).catch(() => null);
        if (solveVal !== null) {
          userResult = true;
        } else {
          const failVal = await kv.get(`failed:${dateStr}:${userId}`).catch(() => null);
          if (failVal !== null) userResult = false;
        }
      }

    days.push({
      dateStr,
      label,
      challengeId: challenge.id,
      questionName: challenge.question,
      difficulty: challenge.difficulty,
      stats: {
        totalUsers: Number(totalUsers),
        solved: Number(solved),
        failed: Number(failed),
        solvedWithHint: Number(solvedWithHint),
        solvedWithoutHint: Number(solvedWithoutHint),
        attemptsDist,
      },
      userResult,
    });
  }

  // Chronological order (oldest first)
  return days;
}