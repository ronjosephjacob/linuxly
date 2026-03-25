"use client";
import { useState, useEffect, useRef, useCallback } from "react";
// Import the secure server functions
import { 
  verifyAndSubmit, 
  getLeaderboard, 
  getPlayerCount, 
  getDailyChallengeAction, 
  checkSolveStatus 
} from "./actions";

// --- TYPES ---
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
  const [mounted, setMounted] = useState(false);

  // --- 1. LAZY STATE INITIALIZATION ---
  const [xp, setXp] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("linuxly_xp");
      return saved ? parseInt(saved) : 0;
    }
    return 0;
  });

  const [userName, setUserName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("linuxly_name") || "Guest";
    }
    return "Guest";
  });

  const [avatarConfig, setAvatarConfig] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("linuxly_avatar_config");
      return saved ? JSON.parse(saved) : { seed: "Tux", style: "pixel-art" };
    }
    return { seed: "Tux", style: "pixel-art" };
  });

  const [streak, setStreak] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const savedStreak = localStorage.getItem("linuxly_streak");
      const lastDate = localStorage.getItem("linuxly_last_date");
      if (savedStreak && lastDate) {
        const today = new Date().toDateString();
        const last = new Date(lastDate).toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (today === last || last === yesterday) {
          return parseInt(savedStreak);
        }
      }
    }
    return 0;
  });

  // --- GAME & DB STATE ---
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [input, setInput] = useState<string>("");
  const [history, setHistory] = useState<{ text: string; type: 'cmd' | 'resp' }[]>([]);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardUser[]>([]);
  const [totalPlayers, setTotalPlayers] = useState<number>(0);
  const [showHint, setShowHint] = useState(false);
  const [isSolved, setIsSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [showHintModal, setShowHintModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const MAX_ATTEMPTS = 5;

  // --- 2. LOGIC HELPERS ---
  const fetchRankings = async () => {
    const [data, count] = await Promise.all([
      getLeaderboard(),
      getPlayerCount()
    ]);
    if (data) setGlobalLeaderboard(data);
    if (count !== undefined) setTotalPlayers(count);
  };

  const refreshChallenge = useCallback(async (currentName: string) => {
    try {
      const dailyQuestion = await getDailyChallengeAction();
      if (dailyQuestion) {
        setChallenge(dailyQuestion as Challenge);
        
        const hasSolvedToday = await checkSolveStatus(currentName);
        
        if (hasSolvedToday) {
          setIsSolved(true);
          setHistory([
            { text: "Restoring session from cloud...", type: 'resp' },
            { text: `Welcome back, ${currentName}. Today's challenge is complete.`, type: 'resp' }
          ]);
        } else {
          setHistory([
            { text: "Synchronizing with Global Daily Challenge...", type: 'resp' },
            { text: "System ready.", type: 'resp' }
          ]);
        }
      }
      setInput("");
      setShowHint(false);
      setAttempts(0);
      setHintUsed(false);
    } catch (error) {
      setHistory([{ text: "Error syncing with server. Reconnecting...", type: 'resp' }]);
    }
  }, []);

  const getRankInfo = (val: number) => {
    if (val >= 1000) return { title: "ROOT", color: "text-red-500", prefix: "#" };
    if (val >= 500) return { title: "SYSADMIN", color: "text-purple-400", prefix: "$" };
    if (val >= 200) return { title: "POWER USER", color: "text-blue-400", prefix: "$" };
    return { title: "NEWBIE", color: "text-emerald-400", prefix: "$" };
  };

  // --- 3. EFFECTS ---
  
  useEffect(() => {
    setMounted(true);
    refreshChallenge(userName);
    fetchRankings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const timer = setInterval(() => {
      const now = new Date();
      const phOffset = 8; 
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const phNow = new Date(utc + (3600000 * phOffset));
      const phMidnight = new Date(phNow);
      phMidnight.setHours(24, 0, 0, 0);
      const diff = phMidnight.getTime() - phNow.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [mounted]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // --- 4. HANDLERS ---
  const updateName = (name: string) => {
    const formatted = name.trim().slice(0, 12) || "User";
    setUserName(formatted);
    localStorage.setItem("linuxly_name", formatted);
    refreshChallenge(formatted);
  };

  const updateAvatar = (seed: string, style: string) => {
    const newCfg = { seed, style };
    setAvatarConfig(newCfg);
    localStorage.setItem("linuxly_avatar_config", JSON.stringify(newCfg));
    setShowAvatarPicker(false);
  };

  const handleConfirmHint = () => {
    setHintUsed(true);
    setShowHint(true);
    setShowHintModal(false);
    setHistory(prev => [...prev, { text: "⚠️ Hint revealed. XP multiplier reduced.", type: 'resp' }]);
  };

  const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isTester = userName === "Tester";
    if ((!isTester && isSolved) || (!isTester && attempts >= MAX_ATTEMPTS) || isChecking) return;

    if (e.key === "Enter") {
      if (!challenge) return;
      
      setIsChecking(true);
      const currentInput = input;
      setInput(""); 

      const result = await verifyAndSubmit(challenge.id, currentInput, userName, xp);

      if (result.success) {
        let multiplier = 1.0;
        if (streak >= 10) multiplier = 1.5;
        else if (streak >= 7) multiplier = 1.3;
        else if (streak >= 3) multiplier = 1.1;
        if (hintUsed) multiplier *= 0.5;

        const baseGain = 25; 
        const finalGain = Math.round(baseGain * multiplier);
        const newTotalXp = xp + finalGain;

        setXp(newTotalXp);
        localStorage.setItem("linuxly_xp", newTotalXp.toString());
        
        setStreak(prev => {
          const newStreak = prev + 1;
          localStorage.setItem("linuxly_streak", newStreak.toString());
          localStorage.setItem("linuxly_last_date", new Date().toDateString());
          return newStreak;
        });

        setIsSolved(true);
        setHistory(prev => [
          ...prev, 
          { text: `$ ${currentInput}`, type: 'cmd' }, 
          { text: `✅ ${result.message || "Correct!"} (+${finalGain} XP)`, type: 'resp' }
        ]);
        await fetchRankings();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setHistory(prev => [
          ...prev, 
          { text: `$ ${currentInput}`, type: 'cmd' }, 
          { text: result.message || (newAttempts >= MAX_ATTEMPTS ? "❌ Access Denied. Lockout engaged." : `❌ Incorrect. Attempts: ${newAttempts}/${MAX_ATTEMPTS}`), type: 'resp' }
        ]);
      }
      setIsChecking(false);
    }
  };

  if (!mounted) return null; 

  const currentRank = getRankInfo(xp);
  const isTester = userName === "Tester";
  const isGameOver = !isTester && (isSolved || attempts >= MAX_ATTEMPTS);

  return (
    <main className="min-h-screen bg-slate-900 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 font-sans text-slate-100 max-w-7xl mx-auto relative">
      
      {/* HINT MODAL */}
      {showHintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 font-mono uppercase">⚠️ Reveal Hint?</h3>
            <p className="text-slate-400 text-sm mb-6">Using a hint reduces potential XP gain for this challenge.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowHintModal(false)} className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-xs font-bold uppercase">Cancel</button>
              <button onClick={handleConfirmHint} className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-colors text-xs font-bold uppercase text-white">Reveal</button>
            </div>
          </div>
        </div>
      )}

      <div className="lg:col-span-4 flex flex-col gap-6">
        {/* PROFILE */}
        <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl relative">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative cursor-pointer group" onClick={() => setShowAvatarPicker(!showAvatarPicker)}>
              <img src={`https://api.dicebear.com/7.x/${avatarConfig.style}/svg?seed=${avatarConfig.seed}`} alt="avatar" className="w-16 h-16 rounded-lg bg-slate-700 p-1 border border-slate-600 group-hover:border-emerald-500 transition-colors" />
              {streak > 0 && <div className="absolute -top-2 -right-2 bg-orange-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-slate-900 animate-bounce">🔥 {streak}</div>}
            </div>
            <div className="flex-1">
              <input value={userName} onChange={(e) => updateName(e.target.value)} className="bg-transparent font-bold text-white w-full outline-none focus:ring-1 ring-emerald-500/20 rounded" />
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] px-2 py-0.5 rounded border ${currentRank.color} border-current font-bold uppercase`}>{currentRank.title}</span>
                <span className="text-[10px] text-slate-500">LVL {Math.floor(xp / 100) + 1}</span>
              </div>
            </div>
          </div>

          {showAvatarPicker && (
            <div className="absolute top-20 left-0 z-20 bg-slate-800 border border-slate-600 p-3 rounded-xl shadow-2xl grid grid-cols-4 gap-2 animate-in fade-in zoom-in-95">
              {AVATAR_STYLES.map((style) => (
                <button key={style.name} onClick={() => updateAvatar(style.name, style.collection)} className={`p-1 rounded border ${avatarConfig.seed === style.name ? 'border-emerald-500 bg-slate-700' : 'border-transparent'}`}>
                  <img src={`https://api.dicebear.com/7.x/${style.collection}/svg?seed=${style.name}`} alt={style.name} className="w-10 h-10" />
                </button>
              ))}
            </div>
          )}

          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden mb-1">
            <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${xp % 100}%` }} />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>{xp} XP</span>
            <span>MULTI: {streak >= 10 ? '1.5' : streak >= 7 ? '1.3' : streak >= 3 ? '1.1' : '1.0'}x</span>
          </div>
        </div>

        {/* REAL GLOBAL LEADERBOARD */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden shadow-lg">
          <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Global Rankings</span>
            <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              {totalPlayers} USERS
            </span>
          </div>
          <div className="p-2 flex flex-col gap-1 max-h-[300px] overflow-y-auto">
            {globalLeaderboard.length > 0 ? globalLeaderboard.map((userItem, i) => (
              <div key={userItem.name} className={`flex items-center gap-3 p-2 rounded-lg ${userItem.name === userName ? 'bg-emerald-500/10 border border-emerald-500/20' : ''}`}>
                <span className="text-[10px] font-mono text-slate-500 w-4">{i + 1}</span>
                <div className="flex-1">
                  <div className={`text-xs font-bold ${userItem.name === userName ? 'text-emerald-400' : 'text-slate-300'}`}>{userItem.name}</div>
                  <div className="text-[8px] text-slate-500 uppercase">{getRankInfo(userItem.xp).title}</div>
                </div>
                <div className="text-[10px] font-mono text-slate-400">{userItem.xp}</div>
              </div>
            )) : <div className="p-4 text-center text-[10px] text-slate-600 font-mono italic">No data synced...</div>}
          </div>
        </div>
      </div>

      <div className="lg:col-span-8 flex flex-col gap-6">
        {/* CHALLENGE DISPLAY */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl min-h-[250px] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${challenge?.difficulty === 'easy' ? 'text-blue-400 bg-blue-400/10' : 'text-red-400 bg-red-400/10'}`}>{challenge?.difficulty}</span>
              <div className="flex gap-2">
                {[...Array(MAX_ATTEMPTS)].map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < attempts ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-slate-700'}`} />
                ))}
              </div>
            </div>
            <h2 className="text-2xl font-medium text-slate-100 leading-snug">{challenge?.question}</h2>
            {showHint && challenge?.hint && (
              <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg animate-in slide-in-from-top-2">
                <p className="text-xs font-mono text-emerald-400"><span className="font-bold mr-2">HINT:</span>{challenge.hint}</p>
              </div>
            )}
          </div>
          <div className="mt-8 pt-6 border-t border-slate-700/50 flex justify-between items-center">
            {!isGameOver ? (
              <button onClick={() => !hintUsed ? setShowHintModal(true) : setShowHint(!showHint)} className="text-[10px] font-mono uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors">
                {showHint ? "[-] Hide Hint" : "[+] Reveal Hint"}
              </button>
            ) : <span className="text-[10px] font-mono text-emerald-500 font-bold uppercase tracking-widest animate-pulse">{isTester ? "DEBUG OVERRIDE" : "LOCKED"}</span>}
            
            {/* SKIP BUTTON HAS BEEN REMOVED ENTIRELY */}
            <div className="flex gap-4 items-center">
            </div>
          </div>
        </div>

        {/* TERMINAL UI */}
        <div className="bg-[#0d1117] rounded-2xl shadow-2xl overflow-hidden border border-slate-700 flex flex-col">
          <div className="p-6 h-64 overflow-y-auto font-mono text-sm">
            {history.map((line, i) => (
              <div key={i} className={`mb-1 ${line.type === 'resp' ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>{line.text}</div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-emerald-500 font-bold shrink-0">{userName.toLowerCase()}@linuxly:{currentRank.prefix}</span>
              <input 
                disabled={isGameOver || isChecking}
                value={isGameOver ? "" : input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleCommand} 
                className={`bg-transparent border-none outline-none flex-1 ${(isGameOver || isChecking) ? 'text-slate-600 italic cursor-not-allowed' : 'text-slate-100'}`} 
                placeholder={isGameOver ? `Locked. Reset in ${timeLeft}` : (isChecking ? "Authenticating..." : "...")} 
                autoFocus 
              />
            </div>
            <div ref={terminalEndRef} />
          </div>
          <div className="bg-slate-800/50 px-6 py-2 border-t border-slate-700/50 flex justify-between items-center text-[10px] font-mono">
             <span className="text-slate-500 select-none">Upstash Secure Cloud Connection: <span className="text-emerald-500">Active</span></span>
             {isGameOver ? <span className="text-emerald-500 font-bold">RESET: {timeLeft}</span> : <span className="text-slate-600">GMT+8 Manila</span>}
          </div>
        </div>
      </div>
    </main>
  );
}