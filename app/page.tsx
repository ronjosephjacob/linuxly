"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { 
  verifyAndSubmit, 
  getLeaderboard, 
  getPlayerCount, 
  getDailyChallengeAction, 
  checkSolveStatus,
  LinuxQuestion 
} from "./actions";

// --- TYPES & INTERFACES ---
interface LeaderboardUser {
  name: string;
  style: string;
  seed: string;
  xp: number;
}

const AVATAR_STYLES = [
  { name: "Tux", collection: "pixel-art" },
  { name: "Pikachu", collection: "bottts" },
  { name: "Explorer", collection: "adventurer" },
  { name: "Glitch", collection: "pixel-art" },
  { name: "Mew", collection: "bottts" },
  { name: "Agent", collection: "adventurer" },
  { name: "Byte", collection: "pixel-art" },
  { name: "Droid", collection: "bottts" },
];

export default function Home() {
  // --- 1. CORE STATES ---
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  // --- 2. PERSISTENT DATA ---
  const [xp, setXp] = useState<number>(0);
  const [userName, setUserName] = useState<string>("Guest");
  const [avatarConfig, setAvatarConfig] = useState({ seed: "Tux", style: "pixel-art" });
  const [streak, setStreak] = useState(0);

  // --- 3. CHALLENGE STATES ---
  const [challenge, setChallenge] = useState<LinuxQuestion | null>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ text: string; type: 'cmd' | 'resp' }[]>([]);
  const [isSolved, setIsSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  // --- 4. GLOBAL DATA ---
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardUser[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const MAX_ATTEMPTS = 5;

  // --- RANKING SYSTEM LOGIC ---
  const getRankInfo = (currentXp: number) => {
    const level = Math.floor(currentXp / 100) + 1;
    if (level >= 25) return { title: "Knight", color: "text-purple-400" };
    if (level >= 20) return { title: "Squire", color: "text-blue-400" };
    if (level >= 15) return { title: "Merchant", color: "text-emerald-400" };
    if (level >= 10) return { title: "Blacksmith", color: "text-orange-400" };
    if (level >= 5) return { title: "Peasant", color: "text-amber-600" };
    return { title: "Nobody", color: "text-slate-500" };
  };

  // --- HELPERS ---
  const getBaseCommand = (answers: string[] | undefined) => {
    if (!answers || answers.length === 0) return "";
    return answers[0].split(" ")[0];
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sXp = localStorage.getItem("linuxly_xp");
      const sName = localStorage.getItem("linuxly_name");
      const sAvatar = localStorage.getItem("linuxly_avatar_config");
      const sStreak = localStorage.getItem("linuxly_streak");
      
      if (sXp) setXp(parseInt(sXp));
      if (sName) setUserName(sName);
      if (sAvatar) setAvatarConfig(JSON.parse(sAvatar));
      if (sStreak) setStreak(parseInt(sStreak));
      setMounted(true);
    }
  }, []);

  const fetchRankings = useCallback(async () => {
    const [data, count] = await Promise.all([getLeaderboard(), getPlayerCount()]);
    if (data) setGlobalLeaderboard(data as LeaderboardUser[]);
    if (count !== undefined) setTotalPlayers(count);
  }, []);

  const syncChallenge = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const daily = await getDailyChallengeAction();
      const solved = await checkSolveStatus(name);
      setChallenge(daily);
      setIsSolved(solved);
      setHistory([{ text: solved ? "System: Task complete. Data synced." : "SSH Session Initialized. Waiting for input...", type: 'resp' }]);
    } catch {
      setHistory([{ text: "Error: Could not reach the remote server.", type: 'resp' }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      syncChallenge(userName);
      fetchRankings();
    }
  }, [mounted, syncChallenge, userName, fetchRankings]);

  // TIMER LOGIC
  useEffect(() => {
    const timer = setInterval(() => {
      const phMidnight = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Manila"}));
      phMidnight.setHours(24, 0, 0, 0);
      const diff = phMidnight.getTime() - new Date().getTime();
      if (diff <= 0) window.location.reload();
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setTimeLeft(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // --- ACTIONS ---
  const handleNameChange = () => {
    const newName = prompt("Enter your handle to join the leaderboards:", userName);
    if (newName && newName.trim() && newName !== userName) {
      const sanitized = newName.trim().substring(0, 15);
      setUserName(sanitized);
      localStorage.setItem("linuxly_name", sanitized);
      // Re-sync with the new name to update solved status
      syncChallenge(sanitized);
    }
  };

  const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSolved || attempts >= MAX_ATTEMPTS || isChecking || e.key !== "Enter" || !challenge) return;
    const cmd = input.trim();
    if (!cmd) return;

    setIsChecking(true);
    setInput("");
    
    const gain = showHint ? 12 : 25;
    const potentialXp = xp + gain;
    const res = await verifyAndSubmit(challenge.id, cmd, userName, potentialXp, avatarConfig);

    if (res.success) {
      setXp(potentialXp);
      localStorage.setItem("linuxly_xp", potentialXp.toString());
      
      const newStreak = streak + 1;
      setStreak(newStreak);
      localStorage.setItem("linuxly_streak", newStreak.toString());
      
      setIsSolved(true);
      setHistory(prev => [
        ...prev, 
        { text: `${userName.toLowerCase()}@linuxly:~$ ${cmd}`, type: 'cmd' }, 
        { text: `[SUCCESS] ${res.message} (+${gain} XP)`, type: 'resp' }
      ]);
      fetchRankings();
    } else {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setHistory(prev => [
        ...prev, 
        { text: `${userName.toLowerCase()}@linuxly:~$ ${cmd}`, type: 'cmd' }, 
        { text: nextAttempts >= MAX_ATTEMPTS ? "❌ LOCKOUT: Max attempts reached." : `❌ ${res.message}`, type: 'resp' }
      ]);
    }
    setIsChecking(false);
  };

  const requestHint = () => {
    if (confirm("Analyzing documentation... This will reduce your reward to 12 XP. Proceed?")) {
      setShowHint(true);
    }
  };

  const updateAvatar = (style: string, seed: string) => {
    const newConfig = { style, seed };
    setAvatarConfig(newConfig);
    localStorage.setItem("linuxly_avatar_config", JSON.stringify(newConfig));
  };

  if (!mounted) return <div className="min-h-screen bg-slate-950" />;

  const isGameOver = isSolved || attempts >= MAX_ATTEMPTS;
  const rank = getRankInfo(xp);

  return (
    <main className="min-h-screen bg-slate-950 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-8 font-sans text-slate-100 max-w-7xl mx-auto">
      
      {/* LEFT SIDEBAR: PROFILE & RANKINGS */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        
        {/* PROFILE CARD */}
        <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden group">
          <div className="flex items-center gap-5 mb-6 relative z-10">
             <div className="relative">
               <img 
                 src={`https://api.dicebear.com/7.x/${avatarConfig.style}/svg?seed=${avatarConfig.seed}`} 
                 alt="avatar" 
                 className="w-20 h-20 rounded-2xl bg-slate-800 p-1 border-2 border-slate-700 shadow-lg" 
               />
               <button 
                 onClick={() => updateAvatar(AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)].collection, Math.random().toString())} 
                 className="absolute -bottom-2 -right-2 bg-emerald-500 p-1.5 rounded-lg border-2 border-slate-900 hover:bg-emerald-400 transition-colors"
               >
                 <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
               </button>
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <h2 className="font-bold text-xl tracking-tight">{userName}</h2>
                 <button onClick={handleNameChange} className="text-slate-500 hover:text-emerald-500 transition-colors">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                 </button>
               </div>
               <div className="flex gap-2 mt-1">
                 <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono uppercase">LVL {Math.floor(xp / 100) + 1}</span>
                 <span className={`text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 ${rank.color} font-mono uppercase font-bold tracking-widest`}>
                    {rank.title}
                 </span>
               </div>
             </div>
          </div>
          <div className="h-2 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-600 transition-all duration-1000" style={{ width: `${xp % 100}%` }} />
          </div>
        </div>

        {/* LEADERBOARD CARD */}
        <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 flex-1 overflow-hidden flex flex-col shadow-inner">
          <div className="bg-slate-900/80 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest font-mono">Top Operators</h3>
            <span className="text-[10px] font-mono text-slate-600 px-2 py-1 bg-slate-950 rounded-md">{totalPlayers} Active</span>
          </div>
          <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar">
            {globalLeaderboard.map((u, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${u.name === userName ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_15px_-5px_rgba(16,185,129,0.2)]' : 'bg-slate-900/50 border-transparent hover:border-slate-700'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-slate-600 w-4">{i + 1}.</span>
                  <img 
                    src={`https://api.dicebear.com/7.x/${u.style}/svg?seed=${u.seed}`} 
                    className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700" 
                    alt="" 
                  />
                  <span className={`text-sm font-medium ${u.name === userName ? 'text-emerald-400' : 'text-slate-300'}`}>{u.name}</span>
                </div>
                <span className="font-mono text-sm text-emerald-500 font-bold">{u.xp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT MAIN: CHALLENGE & TERMINAL */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        
        {/* MISSION PANEL */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          {loading ? (
            <div className="animate-pulse space-y-6">
              <div className="h-10 bg-slate-800 rounded w-3/4"></div>
              <div className="h-20 bg-slate-800 rounded w-full"></div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg border ${challenge?.difficulty === 'easy' ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30'}`}>
                    {challenge?.difficulty} Mission
                  </span>
                  
                  {/* STREAK ICON LOGIC */}
                  {streak >= 3 && (
                    <div className={`flex items-center gap-1.5 text-orange-500 font-bold drop-shadow-lg transition-transform duration-500
                      ${streak >= 10 ? 'scale-150 animate-pulse' : streak >= 5 ? 'scale-125' : 'scale-100'}
                    `}>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                      <span className="text-xs font-mono">{streak}d</span>
                    </div>
                  )}
                </div>

                {/* MANUAL LINK */}
                <a 
                  href={`https://tldr.inbrowser.app/pages/common/${getBaseCommand(challenge?.answers)}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-slate-500 hover:text-emerald-400 uppercase flex items-center gap-1 transition-colors tracking-tighter"
                >
                  Manual <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>

              <h1 className="text-2xl md:text-4xl font-semibold mb-6 leading-tight text-slate-50 tracking-tight">{challenge?.question}</h1>
              
              {showHint && (
                <div className="mb-6 p-5 bg-blue-500/5 border border-blue-500/20 rounded-2xl text-xs font-mono text-blue-300 leading-relaxed shadow-inner">
                  <span className="text-blue-500 font-bold mr-2">HINT_DECRYPTED:</span>
                  {challenge?.hint}
                </div>
              )}

              <div className="pt-6 border-t border-slate-800 flex justify-between items-center">
                 {!isGameOver && !showHint && (
                   <button onClick={requestHint} className="text-[10px] font-bold text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-1">
                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     Request Intelligence
                   </button>
                 )}
                 <div className="text-[10px] font-mono text-slate-600 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                    NEXT_UPLINK: <span className="text-slate-400">{timeLeft}</span>
                 </div>
              </div>
            </>
          )}
        </div>

        {/* TERMINAL INTERFACE */}
        <div className="bg-[#0b0e14] rounded-3xl border border-slate-800 flex flex-col flex-1 min-h-[450px] shadow-2xl relative overflow-hidden group">
          <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center">
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Console v2.4.1</span>
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20" />
            </div>
          </div>

          <div className="p-6 overflow-y-auto font-mono text-sm space-y-2 flex-1 custom-scrollbar">
            {history.map((line, i) => (
              <div key={i} className={`leading-relaxed break-words ${line.type === 'resp' ? 'text-emerald-400' : 'text-slate-400'}`}>
                {line.text}
              </div>
            ))}
            
            <div className="flex gap-3">
              <span className="text-emerald-500 font-bold shrink-0">{userName.toLowerCase()}@linuxly:~$</span>
              <input 
                disabled={isGameOver || isChecking || loading}
                value={isGameOver ? "" : input} 
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleCommand}
                className="bg-transparent outline-none flex-1 text-slate-100 placeholder:text-slate-800" 
                placeholder={isGameOver ? "TERMINAL_LOCKED" : "waiting for command..."}
                autoFocus 
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div ref={terminalEndRef} />
          </div>

          <div className="px-6 py-3 bg-slate-900/30 border-t border-slate-800/50 flex justify-between items-center">
            <div className="text-[9px] font-mono text-slate-600 flex gap-4 uppercase">
              <span>Attempts: {attempts}/{MAX_ATTEMPTS}</span>
              <span>Enc: AES-256</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-mono text-slate-500 uppercase">Live Sync Active</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}