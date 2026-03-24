// app/actions.ts
'use server'
import { kv } from "@vercel/kv";
import challengesData from "../data/challenges.json";

interface Challenge {
  id: number;
  answers: string[];
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