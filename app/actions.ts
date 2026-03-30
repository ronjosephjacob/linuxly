'use server'
import { Redis } from '@upstash/redis'
import challengesData from "../data/challenges.json";

const kv = Redis.fromEnv()

interface RawChallenge {
  id: number;
  answers: string[];
  question: string;
  hint: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  addinfo1?: string;
  addinfo2?: string;
  usecase?: string;
}

export interface LinuxQuestion {
  id: number;
  question: string;
  hint: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  answers: string[]; 
  addinfo1?: string;
  addinfo2?: string;
  usecase?: string;
}

function getManilaDateString() {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Manila', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(new Date()); 
}

export async function getDailyChallengeAction() {
  const todayStr = getManilaDateString();
  let hash = 0;
  for (let i = 0; i < todayStr.length; i++) {
    hash = Math.imul(31, hash) + todayStr.charCodeAt(i) | 0;
  }
  const dailyIndex = Math.abs(hash) % challengesData.length;
  return challengesData[dailyIndex] as LinuxQuestion;
}

// Fetch Daily Global Stats — all 8 reads fired in parallel (#9)
export async function getDailyStatsAction() {
  const todayStr = getManilaDateString();

  const [totalUsers, solved, failed, solvedWithHint, solvedWithoutHint, ...attemptCounts] =
    await Promise.all([
      kv.scard(`daily_stats:${todayStr}:users`),
      kv.get(`daily_stats:${todayStr}:solved`),
      kv.get(`daily_stats:${todayStr}:failed`),
      kv.get(`daily_stats:${todayStr}:solved_with_hint`),
      kv.get(`daily_stats:${todayStr}:solved_without_hint`),
      ...([1,2,3,4,5].map(i => kv.get(`daily_stats:${todayStr}:attempts:${i}`))),
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

export async function verifyAndSubmit(
  challengeId: number, 
  userInput: string, 
  userId: string, 
  attemptNumber: number,
  usedHint: boolean
) {
  const todayStr = getManilaDateString();
  const solveKey = `solved:${todayStr}:${userId}`;

  const alreadySolved = await kv.get(solveKey);
  if (alreadySolved) {
    return { success: false, message: "⚠️ Already submitted today." };
  }

  // 1. Track unique user participation — only needed on first attempt (#10)
  if (attemptNumber === 1) {
    const usersKey = `daily_stats:${todayStr}:users`;
    await kv.sadd(usersKey, userId);
    await kv.expire(usersKey, 172800);
  }

  const challenge = (challengesData as RawChallenge[]).find(c => c.id === challengeId);
  if (!challenge) return { success: false, message: "Critical: Data missing." };

  const clean = (str: string) => str.trim().toLowerCase().replace(/\/+$/, "").replace(/\s+/g, " ");
  const isCorrect = challenge.answers.some((ans) => clean(ans) === clean(userInput));

  if (isCorrect) {
    // Save solve status + per-user session data for reload recovery
    await Promise.all([
      kv.set(solveKey, true, { ex: 172800 }),
      kv.set(`answer:${todayStr}:${userId}`, userInput, { ex: 172800 }),
      kv.set(`attempts:${todayStr}:${userId}`, attemptNumber, { ex: 172800 }),
      kv.set(`hint:${todayStr}:${userId}`, usedHint ? 1 : 0, { ex: 172800 }),
    ]);

    // Track Success Stats
    const solvedKey = `daily_stats:${todayStr}:solved`;
    const attemptKey = `daily_stats:${todayStr}:attempts:${attemptNumber}`;
    const hintStatKey = `daily_stats:${todayStr}:${usedHint ? 'solved_with_hint' : 'solved_without_hint'}`;
    
    await kv.incr(solvedKey);
    await kv.expire(solvedKey, 172800);
    await kv.incr(attemptKey);
    await kv.expire(attemptKey, 172800);
    await kv.incr(hintStatKey);
    await kv.expire(hintStatKey, 172800);

    return { success: true, message: "Success: Hash verified." };
  }

  // Track Failure Stats
  if (attemptNumber >= 5) {
    const failedKey = `daily_stats:${todayStr}:failed`;
    await kv.incr(failedKey);
    await kv.expire(failedKey, 172800);
    // Track per-user failure so weekly recap can colour-code the day
    const userFailKey = `failed:${todayStr}:${userId}`;
    await kv.set(userFailKey, true, { ex: 172800 });
  }

  return { success: false, message: "Error: Invalid command sequence." };
}

// Fetch stored session data for a user on page reload (to rebuild terminal history)
export async function getUserSessionAction(userId: string) {
  const todayStr = getManilaDateString();

  const [solveVal, answerVal, attemptsVal, hintVal] = await Promise.all([
    kv.get(`solved:${todayStr}:${userId}`),
    kv.get(`answer:${todayStr}:${userId}`),
    kv.get(`attempts:${todayStr}:${userId}`),
    kv.get(`hint:${todayStr}:${userId}`),
  ]);

  return {
    solved: !!solveVal,
    answer: answerVal as string | null,
    attempts: Number(attemptsVal ?? 0),
    usedHint: !!hintVal,
  };
}