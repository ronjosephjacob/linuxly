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
}

export interface LinuxQuestion {
  id: number;
  question: string;
  hint: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
}

/**
 * FIXED: Returns YYYY-MM-DD locked specifically to Manila Time (GMT+8)
 * This prevents the question from changing if the server is in a different timezone.
 */
function getManilaDateString() {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Manila', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(new Date()); 
}

// 1. GET THE GLOBAL DAILY QUESTION (Determined by Math, not Randomness)
export async function getDailyChallengeAction() {
  const todayStr = getManilaDateString();
  
  // Mathematical Hash: Ensures the index is 100% stable for the entire 24h period.
  let hash = 0;
  for (let i = 0; i < todayStr.length; i++) {
    hash = Math.imul(31, hash) + todayStr.charCodeAt(i) | 0;
  }
  
  const dailyIndex = Math.abs(hash) % challengesData.length;
  return challengesData[dailyIndex] as LinuxQuestion;
}

// 2. CHECK IF USER ALREADY SOLVED TODAY
export async function checkSolveStatus(userName: string) {
  const todayStr = getManilaDateString();
  const solveKey = `solved:${todayStr}:${userName}`;
  const alreadySolved = await kv.get(solveKey);
  return !!alreadySolved; 
}

// 3. VERIFY ANSWER AND SAVE SCORE
export async function verifyAndSubmit(challengeId: number, userInput: string, userName: string, currentXp: number) {
  const todayStr = getManilaDateString();
  const solveKey = `solved:${todayStr}:${userName}`;

  const alreadySolved = await kv.get(solveKey);
  if (alreadySolved) {
    return { success: false, message: "⚠️ You have already solved today's challenge." };
  }

  const challenge = (challengesData as RawChallenge[]).find(c => c.id === challengeId);
  if (!challenge) return { success: false, message: "Challenge error." };

  const clean = (str: string) => str.trim().toLowerCase().replace(/\/+$/, "").replace(/\s+/g, " ");
  const isCorrect = challenge.answers.some((ans) => clean(ans) === clean(userInput));

  if (isCorrect) {
    // Mark as solved in Redis for 24 hours
    await kv.set(solveKey, true, { ex: 86400 });
    // Update Global Leaderboard
    await kv.zadd("leaderboard_alpha", { score: currentXp, member: userName });
    return { success: true, message: "Correct! Progress saved to cloud." };
  }

  return { success: false, message: "Incorrect command." };
}

// 4. LEADERBOARD UTILITIES
export async function getLeaderboard() {
  try {
    const topUsers = await kv.zrange("leaderboard_alpha", 0, 9, { rev: true, withScores: true });
    const formatted = [];
    for (let i = 0; i < topUsers.length; i += 2) {
      formatted.push({ name: topUsers[i] as string, xp: topUsers[i + 1] as number });
    }
    return formatted;
  } catch { return []; }
}

export async function getPlayerCount() {
  try { return await kv.zcard("leaderboard_alpha"); } catch { return 0; }
}