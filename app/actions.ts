// app/actions.ts
'use server'
import { Redis } from '@upstash/redis'
import challengesData from "../data/challenges.json";

export interface LinuxQuestion {
  id: string | number;
  command: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  // Add any other fields you use, like category or hints
}

interface Challenge {
  id: number;
  answers: string[];
}

const kv = Redis.fromEnv()

export async function getDailyQuestion(allQuestions: LinuxQuestion[]) {
  const today = new Date().toISOString().split('T')[0]; 
  const cacheKey = `daily_question:${today}`;

  // 1. Check if a question is already picked for today
  let dailyId = await kv.get<number>(cacheKey);

  if (dailyId === null || dailyId === undefined) {
    // 2. Pick a random index
    dailyId = Math.floor(Math.random() * allQuestions.length);
    
    // 3. Store it in Redis with a 24-hour expiry
    await kv.set(cacheKey, dailyId, { ex: 86400 });
  }

  return allQuestions[dailyId];
}

export async function verifyAndSubmit(challengeId: number, userInput: string, userName: string, currentXp: number) {
  // 1. Find the challenge
  const challenge = (challengesData as Challenge[]).find(c => c.id === challengeId);
  if (!challenge) return { success: false, error: "Challenge not found" };

  const clean = (str: string) => str.trim().toLowerCase().replace(/\/+$/, "").replace(/\s+/g, " ");
  const userCleaned = clean(userInput);
  const isCorrect = challenge.answers.some((ans) => clean(ans) === userCleaned);

  if (isCorrect) {
    // 2. Calculate new XP
    const newTotalXp = currentXp + 25; 
    
    // 3. Update the Global Leaderboard in Upstash
    // We use userName as the unique identifier.
    await kv.zadd("leaderboard_alpha", { score: newTotalXp, member: userName });

    return { 
      success: true, 
      newXp: newTotalXp,
      shouldIncrementStreak: true, 
      message: "Correct! Global rank updated." 
    };
  }

  return { success: false };
}

// 4. Fetch the real leaderboard from Upstash
export async function getLeaderboard() {
  try {
    // Fetches top 10 players from the sorted set
    const topUsers = await kv.zrange("leaderboard_alpha", 0, 9, { 
      rev: true, 
      withScores: true 
    });
    
    const formatted = [];
    // Upstash returns [member, score, member, score...]
    for (let i = 0; i < topUsers.length; i += 2) {
      formatted.push({
        name: topUsers[i] as string,
        xp: topUsers[i + 1] as number,
      });
    }
    return formatted;
  } catch (_e) {
    // Prefixing with _ ignores the 'unused variable' warning
    return []; 
  }
}

export async function getPlayerCount() {
  try {
    // 'zcard' returns the total count of items in the sorted set
    const count = await kv.zcard("leaderboard_alpha");
    return count;
  } catch (_e) {
    return 0;
  }
}