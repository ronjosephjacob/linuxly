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

// 1. GET THE GLOBAL DAILY QUESTION
export async function getDailyChallengeAction() {
  const today = new Date().toISOString().split('T')[0]; 
  const cacheKey = `daily_question_id:${today}`;

  let dailyIndex = await kv.get<number>(cacheKey);

  if (dailyIndex === null || dailyIndex === undefined) {
    dailyIndex = Math.floor(Math.random() * challengesData.length);
    await kv.set(cacheKey, dailyIndex, { ex: 86400 });
  }

  return challengesData[dailyIndex] as LinuxQuestion;
}

// 2. CHECK IF USER ALREADY SOLVED TODAY
export async function checkSolveStatus(userName: string) {
  const today = new Date().toISOString().split('T')[0];
  const solveKey = `solved:${today}:${userName}`;
  const alreadySolved = await kv.get(solveKey);
  return !!alreadySolved; 
}

// 3. VERIFY ANSWER AND SAVE SCORE
export async function verifyAndSubmit(challengeId: number, userInput: string, userName: string, currentXp: number) {
  const today = new Date().toISOString().split('T')[0];
  const solveKey = `solved:${today}:${userName}`;

  // Anti-cheat: Check solve status first
  const alreadySolved = await kv.get(solveKey);
  if (alreadySolved) {
    return { success: false, message: "⚠️ Already submitted today." };
  }

  // Replace: const challenge = (challengesData as any[]).find(c => c.id === challengeId);
// With:
const challenge = (challengesData as RawChallenge[]).find(c => c.id === challengeId);

if (!challenge) return { success: false, message: "Challenge not found" };

const clean = (str: string) => str.trim().toLowerCase().replace(/\/+$/, "").replace(/\s+/g, " ");

// TypeScript now knows 'ans' is a string because of RawChallenge[]
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