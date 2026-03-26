'use server'
import { Redis } from '@upstash/redis'
import challengesData from "../data/challenges.json";

const kv = Redis.fromEnv()

// ── helpers ──────────────────────────────────────────────────────────────────

function getManilaDateString(date?: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date ?? new Date());
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
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  now.setDate(now.getDate() + days);
  return getManilaDateString(now);
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
export async function getWeeklyRecapAction(userId: string): Promise<WeekDay[]> {
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
    for (let i = 1; i <= 5; i++) {
      const v = await kv.get(`daily_stats:${dateStr}:attempts:${i}`).catch(() => 0);
      attemptsDist.push(Number(v));
    }

    // Did this user participate?
    let userResult: boolean | null = null;
    const solveKey = `solved:${dateStr}:${userId}`;
    const solveVal = await kv.get(solveKey).catch(() => null);

    if (solveVal !== null) {
      // They solved it
      userResult = true;
    } else {
      // Check if they attempted but failed – we track failure per-user via a separate key
      const failKey = `failed:${dateStr}:${userId}`;
      const failVal = await kv.get(failKey).catch(() => null);
      if (failVal !== null) userResult = false;
      // else null = didn't participate
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