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

// Helper function to lock time to GMT+8 Manila
function getManilaDateString() {
  const now = new Date();
  const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return phTime.toISOString().split('T')[0]; 
}

// 1. GET THE GLOBAL DAILY QUESTION (100% Refresh Safe)
export async function getDailyChallengeAction() {
  const todayStr = getManilaDateString();
  
  // Mathematical Hash: This guarantees the index is always exactly the same for a specific date,
  // bypassing any database connection delays or caching issues.
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

  // Anti-cheat: Check solve status first
  const alreadySolved = await kv.get(solveKey);
  if (alreadySolved) {
    return { success: false, message: "⚠️ Score ignored: You have already submitted an answer today." };
  }

  const challenge = (challengesData as RawChallenge[]).find(c => c.id === challengeId);
  if (!challenge) return { success: false, message: "Challenge not found" };

  const clean = (str: string) => str.trim().toLowerCase().replace(/\/+$/, "").replace(/\s+/g, " ");
  const isCorrect = challenge.answers.some((ans) => clean(ans) === clean(userInput));

  if (isCorrect) {
    await kv.set(solveKey, true, { ex: 86400 });
    // Update the Global Leaderboard
    await kv.zadd("leaderboard_alpha", { score: currentXp, member: userName });
    return { success: true, message: "Correct!" };
  }

  return { success: false, message: "Incorrect command." };
}

// 4. LEADERBOARD FUNCTIONS
export async function getLeaderboard() {
  try {
    const topUsers = await kv.zrange("leaderboard_alpha", 0, 9, { rev: true, withScores: true });
    const formatted = [];
    for (let i = 0; i < topUsers.length; i += 2) {
      formatted.push({ name: topUsers[i] as string, xp: topUsers[i + 1] as number });
    }
    return formatted;
  } catch {
    return [];
  }
}

export async function getPlayerCount() {
  try {
    return await kv.zcard("leaderboard_alpha");
  } catch {
    return 0;
  }
}