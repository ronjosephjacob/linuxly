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
  answers: string[]; 
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

export async function verifyAndSubmit(
  challengeId: number, 
  userInput: string, 
  userName: string, 
  currentXp: number,
  avatarConfig: { style: string; seed: string } 
) {
  const todayStr = getManilaDateString();
  const solveKey = `solved:${todayStr}:${userName}`;

  const alreadySolved = await kv.get(solveKey);
  if (alreadySolved) {
    return { success: false, message: "⚠️ Already submitted today." };
  }

  const challenge = (challengesData as RawChallenge[]).find(c => c.id === challengeId);
  if (!challenge) return { success: false, message: "Critical: Data missing." };

  const clean = (str: string) => str.trim().toLowerCase().replace(/\/+$/, "").replace(/\s+/g, " ");
  const isCorrect = challenge.answers.some((ans) => clean(ans) === clean(userInput));

  if (isCorrect) {
    await kv.set(solveKey, true, { ex: 86400 });
    const memberKey = `${userName}|${avatarConfig.style}|${avatarConfig.seed}`;
    await kv.zadd("leaderboard_alpha", { score: currentXp, member: memberKey });
    return { success: true, message: "Success: Hash verified. XP synchronized." };
  }

  return { success: false, message: "Error: Invalid command sequence." };
}

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