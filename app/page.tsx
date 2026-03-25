"use client";
import { useState, useEffect, useRef, useCallback } from "react";
// Import the secure server actions
import { 
  verifyAndSubmit, 
  getLeaderboard, 
  getPlayerCount, 
  getDailyChallengeAction, 
  checkSolveStatus 
} from "./actions";

// --- TYPES & INTERFACES ---
interface Challenge {
  id: number;
  difficulty: "easy" | "medium" | "hard" | "expert";
  question: string;
  hint: string;
}

interface LeaderboardUser {
  name: string;
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

  // --- 2. PERSISTENT USER DATA (LocalStorage) ---
  const [xp, setXp] = useState<number>(0);
  const [userName, setUserName] = useState<string>("Guest");
  const [avatarConfig, setAvatarConfig] = useState({ seed: "Tux", style: "pixel-art" });

  // --- 3. GAMEPLAY STATE ---
  const [challenge, setChallenge] = useState<Challenge | null>(null);
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

  // --- 5. INITIALIZATION & SYNC ---
  
  // Load local data once mounted
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedXp = localStorage.getItem("linuxly_xp");
      const savedName = localStorage.getItem("linuxly_name");
      const savedAvatar = localStorage.getItem("linuxly_avatar_config");
      
      if (savedXp) setXp(parseInt(savedXp));
      if (savedName) setUserName(savedName);
      if (savedAvatar) setAvatarConfig(JSON.parse(savedAvatar));
      
      setMounted(true);
    }
  }, []);

  const fetchRankings = useCallback(async () => {
    const [data, count] = await Promise.all([getLeaderboard(), getPlayerCount()]);
    if (data) setGlobalLeaderboard(data);
    if (count !== undefined) setTotalPlayers(count);
  }, []);

  const syncChallenge = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const daily = await getDailyChallengeAction();
      const solved = await checkSolveStatus(name);
      
      setChallenge(daily as Challenge);
      setIsSolved(solved);
      
      if (solved) {
        setHistory([{ text: "System: Security cleared. Today's task is already complete.", type: 'resp' }]);
      } else {
        setHistory([{ text: "Establishing secure shell... Connected to remote host.", type: 'resp' }]);
      }
    } catch (e) {
      setHistory([{ text: "Error: Connection to challenge server failed.", type: 'resp' }]);
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

  // Midnight Reset Timer (Manila Time calculation logic is handled in actions.ts for the question)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const phMidnight = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Manila"}));
      phMidnight.setHours(24, 0, 0, 0);
      
      const diff = phMidnight.getTime() - new Date().getTime();
      if (diff <= 0) {
        window.location.reload(); // Refresh the page at midnight
      }

      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setTimeLeft(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // --- 6. HANDLERS ---
  const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSolved || attempts >= MAX_ATTEMPTS || isChecking || e.key !== "Enter" || !challenge) return;

    const cmd = input.trim();
    if (!cmd) return;

    setIsChecking(true);
    setInput("");
    
    // Server-side verification
    const res = await verifyAndSubmit(challenge.id, cmd, userName, xp);

    if (res.success) {
      const gain = showHint ? 12 : 25;
      const newXp = xp + gain;
      setXp(newXp);
      localStorage.setItem("linuxly_xp", newXp.toString());
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
        { text: nextAttempts >= MAX_ATTEMPTS ? "❌ LOCKOUT: Maximum attempts reached. Access denied until reset." : `❌ ${res.message}`, type: 'resp' }
      ]);
    }
    setIsChecking(false);
  };

  const updateAvatar = (style: string, seed: string) => {
    const newConfig = { style, seed };
    setAvatarConfig(newConfig);
    localStorage.setItem("linuxly_avatar_config", JSON.stringify(newConfig));
  };

  if (!mounted) return <div className="min-h-screen bg-slate-900" />;

  const isGameOver = isSolved || attempts >= MAX_ATTEMPTS;

  return (
    <main className="min-h-screen bg-slate-950 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-8 font-sans text-slate-100 max-w-7xl mx-auto">
      
      {/* LEFT SIDEBAR: PROFILE & RANKINGS */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        
        {/* Profile Card */}
        <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="flex items-center gap-5 mb-6">
             <div className="relative group">
               <img 
                 src={`https://api.dicebear.com/7.x/${avatarConfig.style}/svg?seed=${avatarConfig.seed}`} 
                 alt="avatar" 
                 className="w-20 h-20 rounded-2xl bg-slate-800 p-1 border-2 border-slate-700 group-hover:border-emerald-500 transition-colors" 
               />
               <button 
                 onClick={() => updateAvatar(AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)].collection, Math.random().toString())}
                 className="absolute -bottom-2 -right-2 bg-emerald-500 p-1.5 rounded-lg border-2 border-slate-900 hover:scale-110 transition-transform"
               >
                 <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
               </button>
             </div>
             <div>
               <h2 className="font-bold text-xl tracking-tight">{userName}</h2>
               <div className="flex items-center gap-2 mt-1">
                 <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono uppercase">
                   LVL {Math.floor(xp / 100) + 1}
                 </span>
                 <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono uppercase">
                   {xp >= 1000 ? "Kernel Expert" : "Standard User"}
                 </span>
               </div>
             </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono text-slate-500">
              <span>XP PROGRESS</span>
              <span>{xp} Total</span>
            </div>
            <div className="h-3 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000" 
                style={{ width: `${xp % 100}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Global Rankings */}
        <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 flex-1 overflow-hidden flex flex-col">
          <div className="bg-slate-900/80 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Global Rankings</h3>
            <span className="text-[10px] font-mono text-slate-600">{totalPlayers} Players</span>
          </div>
          <div className="p-4 space-y-2 overflow-y-auto">
            {globalLeaderboard.map((u, i) => (
              <div 
                key={i} 
                className={`flex justify-between items-center p-3 rounded-xl border transition-colors ${u.name === userName ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-900/50 border-transparent hover:border-slate-700'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-mono w-4 ${i < 3 ? 'text-emerald-400 font-bold' : 'text-slate-600'}`}>{i + 1}.</span>
                  <span className="text-sm font-medium">{u.name}</span>
                </div>
                <span className="font-mono text-sm text-emerald-500">{u.xp.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT: CHALLENGE & TERMINAL */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        
        {/* Challenge Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/><path d="M13 7h-2v6h6v-2h-4z"/></svg>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-6">
              <div className="h-4 bg-slate-800 rounded w-1/4"></div>
              <div className="h-10 bg-slate-800 rounded w-3/4"></div>
              <div className="h-20 bg-slate-800 rounded w-full"></div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg border ${
                    challenge?.difficulty === 'easy' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                    challenge?.difficulty === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                    'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}>
                    {challenge?.difficulty || 'Daily'} Mission
                  </span>
                </div>
                
                <h1 className="text-2xl md:text-3xl font-semibold leading-tight mb-6">
                  {challenge?.question}
                </h1>

                {showHint && (
                  <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl animate-in fade-in slide-in-from-top-2">
                    <p className="text-xs font-mono text-blue-300 leading-relaxed">
                      <span className="text-blue-500 font-bold mr-2">HINT_PROVIDER:</span>
                      {challenge?.hint}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-800 flex flex-wrap justify-between items-center gap-4">
                 {!isGameOver && !showHint && (
                   <button 
                     onClick={() => setShowHint(true)} 
                     className="text-[10px] uppercase font-bold text-slate-500 hover:text-blue-400 flex items-center gap-2 transition-colors group"
                   >
                     <span className="p-1.5 rounded-md bg-slate-800 group-hover:bg-blue-500/20">?</span>
                     Request Decryption Hint
                   </button>
                 )}
                 {showHint && !isGameOver && (
                   <span className="text-[10px] uppercase font-bold text-blue-500/60 italic">Hint Decrypted (-13 XP potential)</span>
                 )}
                 <div className="text-[10px] font-mono text-slate-600 flex items-center gap-4">
                    <span>STATUS: {isGameOver ? 'CLOSED' : 'ACTIVE'}</span>
                    <span className="text-emerald-500/50">RESET IN: {timeLeft}</span>
                 </div>
              </div>
            </>
          )}
        </div>

        {/* Terminal Area */}
        <div className="bg-[#0b0e14] rounded-3xl border border-slate-800 flex flex-col shadow-inner overflow-hidden flex-1 min-h-[400px]">
          {/* Header Bar */}
          <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/20 border border-rose-500/40"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/40"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40"></div>
            </div>
            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Linuxly_Terminal_v2.4</div>
          </div>

          {/* Lines */}
          <div className="p-6 overflow-y-auto font-mono text-sm space-y-2 flex-1">
            {history.map((line, i) => (
              <div key={i} className={`${line.type === 'resp' ? 'text-emerald-400' : 'text-slate-400'} leading-relaxed break-words`}>
                {line.text}
              </div>
            ))}
            
            {/* Input Line */}
            <div className="flex gap-3">
              <span className="text-emerald-500 shrink-0 font-bold">{userName.toLowerCase()}@linuxly:~$</span>
              <input 
                disabled={isGameOver || isChecking || loading}
                value={isGameOver ? "" : input} 
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleCommand}
                className="bg-transparent outline-none flex-1 text-slate-100 placeholder:text-slate-800" 
                placeholder={isGameOver ? `MISSION_LOCKED: NEXT IN ${timeLeft}` : "enter command..."}
                autoFocus 
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div ref={terminalEndRef} />
          </div>

          {/* Footer */}
          <div className="px-6 py-2 bg-slate-900/30 border-t border-slate-800/50 flex justify-between items-center text-[9px] font-mono text-slate-600">
            <div className="flex gap-4">
              <span>ATTEMPTS: {attempts}/{MAX_ATTEMPTS}</span>
              <span>BUFFER: 1024KB</span>
            </div>
            <div className="flex gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              LIVE_DATA_SYNC
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}