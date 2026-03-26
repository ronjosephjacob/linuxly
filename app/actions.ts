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

export async function checkSolveStatus(userName: string) {
  const todayStr = getManilaDateString();
  const solveKey = `solved:${todayStr}:${userName}`;
  const alreadySolved = await kv.get(solveKey);
  return !!alreadySolved; 
}

// NEW: Fetch Daily Global Stats
export async function getDailyStatsAction() {
  const todayStr = getManilaDateString();
  const totalUsers = await kv.scard(`daily_stats:${todayStr}:users`) || 0;
  const solved = await kv.get(`daily_stats:${todayStr}:solved`) as number || 0;
  const failed = await kv.get(`daily_stats:${todayStr}:failed`) as number || 0;

  const attemptsDist = [];
  for(let i = 1; i <= 5; i++) {
    const count = await kv.get(`daily_stats:${todayStr}:attempts:${i}`) as number || 0;
    attemptsDist.push(Number(count));
  }

  return { totalUsers, solved: Number(solved), failed: Number(failed), attemptsDist };
}

export async function verifyAndSubmit(
  challengeId: number, 
  userInput: string, 
  userName: string, 
  currentXp: number,
  avatarConfig: { style: string; seed: string },
  attemptNumber: number // Required to track how many tries it took
) {
  const todayStr = getManilaDateString();
  const solveKey = `solved:${todayStr}:${userName}`;

  const alreadySolved = await kv.get(solveKey);
  if (alreadySolved) {
    return { success: false, message: "⚠️ Already submitted today." };
  }

  // 1. Track unique user participation for the day
  const usersKey = `daily_stats:${todayStr}:users`;
  await kv.sadd(usersKey, userName);
  await kv.expire(usersKey, 172800); // Auto-delete after 48 hours to save DB space

  const challenge = (challengesData as RawChallenge[]).find(c => c.id === challengeId);
  if (!challenge) return { success: false, message: "Critical: Data missing." };

  const clean = (str: string) => str.trim().toLowerCase().replace(/\/+$/, "").replace(/\s+/g, " ");
  const isCorrect = challenge.answers.some((ans) => clean(ans) === clean(userInput));

  if (isCorrect) {
    // Save solve status
    await kv.set(solveKey, true, { ex: 86400 });
    
    // Preserve background leaderboard data
    const memberKey = `${userName}|${avatarConfig.style}|${avatarConfig.seed}`;
    await kv.zadd("leaderboard_alpha", { score: currentXp, member: memberKey });

    // Track Success Stats
    const solvedKey = `daily_stats:${todayStr}:solved`;
    const attemptKey = `daily_stats:${todayStr}:attempts:${attemptNumber}`;
    await kv.incr(solvedKey);
    await kv.expire(solvedKey, 172800);
    await kv.incr(attemptKey);
    await kv.expire(attemptKey, 172800);

    return { success: true, message: "Success: Hash verified. XP synchronized." };
  }

  // Track Failure Stats (If max attempts reached)
  if (attemptNumber >= 5) {
    const failedKey = `daily_stats:${todayStr}:failed`;
    await kv.incr(failedKey);
    await kv.expire(failedKey, 172800);
  }

  return { success: false, message: "Error: Invalid command sequence." };
}

// Keeping this just in case you ever want to revert to the leaderboard UI
export async function getLeaderboard() {
  try {
    const topUsers = await kv.zrange("leaderboard_alpha", 0, 9, { rev: true, withScores: true });
    const formatted = [];
    for (let i = 0; i < topUsers.length; i += 2) {
      const rawMember = topUsers[i] as string;
      const [name, style, seed] = rawMember.split('|');
      formatted.push({ 
        name: name || "Unknown", 
        style: style || 'pixel-art', 
        seed: seed || 'Tux', 
        xp: topUsers[i + 1] as number 
      });
    }
    return formatted;
  } catch { return []; }
}

export async function getPlayerCount() {
  try { return await kv.zcard("leaderboard_alpha"); } catch { return 0; }
}