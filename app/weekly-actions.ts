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
  answers: string[];        // correct answers for the modal
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

// ── server-side memory cache for past day stats (#18) ────────────────────────
// Lives in Vercel function RAM — free to read, persists while instance is warm.
// Only past days are cached (they never change). Today is always fetched fresh.

interface DayStats {
  totalUsers: number;
  solved: number;
  failed: number;
  solvedWithHint: number;
  solvedWithoutHint: number;
  attemptsDist: number[];
}

const pastDaysCache: Record<string, DayStats> = {};
let pastDaysCacheDate = ""; // tracks which "today" the cache was built for

// ── helpers ───────────────────────────────────────────────────────────────────

/** Fetch all 10 stats for a single date in one parallel batch (#15) */
async function fetchDayStats(dateStr: string): Promise<DayStats> {
  const [totalUsers, solved, failed, solvedWithHint, solvedWithoutHint, ...attemptCounts] =
    await Promise.all([
      kv.scard(`daily_stats:${dateStr}:users`).catch(() => 0),
      kv.get(`daily_stats:${dateStr}:solved`).catch(() => 0),
      kv.get(`daily_stats:${dateStr}:failed`).catch(() => 0),
      kv.get(`daily_stats:${dateStr}:solved_with_hint`).catch(() => 0),
      kv.get(`daily_stats:${dateStr}:solved_without_hint`).catch(() => 0),
      ...([1,2,3,4,5].map(i => kv.get(`daily_stats:${dateStr}:attempts:${i}`).catch(() => 0))),
    ]);

  return {
    totalUsers:        Number(totalUsers        ?? 0),
    solved:            Number(solved            ?? 0),
    failed:            Number(failed            ?? 0),
    solvedWithHint:    Number(solvedWithHint    ?? 0),
    solvedWithoutHint: Number(solvedWithoutHint ?? 0),
    attemptsDist:      attemptCounts.map(v => Number(v ?? 0)),
  };
}

// ── exported actions ──────────────────────────────────────────────────────────

/**
 * Returns Mon–today as WeekDay objects.
 * - Past days served from server memory after first fetch (#18)
 * - All Redis reads for all days fired in one parallel batch (#15)
 * - User result checks for both solved+failed run in parallel (#16)
 */
export async function getWeeklyRecapAction(
  userId: string,
  cachedResults: Record<string, boolean | null> = {}
): Promise<WeekDay[]> {
  const todayStr = getManilaDateString();

  // Reset cache when the day rolls over
  if (pastDaysCacheDate !== todayStr) {
    Object.keys(pastDaysCache).forEach(k => delete pastDaysCache[k]);
    pastDaysCacheDate = todayStr;
  }

  // Build Mon→today date list, deduped by challenge id
  const dayOfWeek = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : -(dayOfWeek - 1);

  const datesToShow: string[] = [];
  const seenIds = new Set<number>();

  for (let offset = mondayOffset; offset <= 0; offset++) {
    const dateStr = manilaDateOffset(offset);
    const challenge = getChallengeForDate(dateStr);
    if (seenIds.has(challenge.id)) continue;
    seenIds.add(challenge.id);
    datesToShow.push(dateStr);
  }

  // Separate past days (cacheable) from today (always fresh)
  const pastDates = datesToShow.filter(d => d !== todayStr);
  const uncachedPastDates = pastDates.filter(d => !(d in pastDaysCache));

  // #15: Fire all uncached past days + today + user checks in one parallel batch
  let todayStats: DayStats = {
    totalUsers: 0, solved: 0, failed: 0,
    solvedWithHint: 0, solvedWithoutHint: 0, attemptsDist: [0,0,0,0,0],
  };
  const userResultMap: Record<string, boolean | null> = { ...cachedResults };
  const unknownDates = datesToShow.filter(d => !(d in cachedResults));

  await Promise.all([
    // Fetch uncached past days → store in server memory
    ...uncachedPastDates.map(d =>
      fetchDayStats(d).then(s => { pastDaysCache[d] = s; })
    ),
    // Always fetch today fresh
    fetchDayStats(todayStr).then(s => { todayStats = s; }),
    // User result checks — solved + failed fetched in parallel per day (#16)
    ...unknownDates.map(d =>
      Promise.all([
        kv.get(`solved:${d}:${userId}`).catch(() => null),
        kv.get(`failed:${d}:${userId}`).catch(() => null),
      ]).then(([solveVal, failVal]) => {
        userResultMap[d] = solveVal !== null ? true
                         : failVal !== null  ? false
                         : null;
      })
    ),
  ]);

  // Assemble final result in chronological order
  return datesToShow.map(dateStr => {
    const challenge = getChallengeForDate(dateStr);
    const stats = dateStr === todayStr ? todayStats : pastDaysCache[dateStr];

    // Label formatted with explicit UTC date parts to avoid server timezone (#19)
    const [year, month, day] = dateStr.split('-').map(Number);
    const label = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' })
      .format(new Date(Date.UTC(year, month - 1, day)));

    return {
      dateStr,
      label,
      challengeId:  challenge.id,
      questionName: challenge.question,
      difficulty:   challenge.difficulty,
      answers:      challenge.answers,
      stats,
      userResult:   userResultMap[dateStr] ?? null,
    };
  });
}