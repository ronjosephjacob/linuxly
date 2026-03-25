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

// --- FIXED AVATAR PRESETS ---
const AVATAR_PRESETS = [
  { seed: "Tux", style: "pixel-art" }, { seed: "Buster", style: "pixel-art" },
  { seed: "Ace", style: "pixel-art" }, { seed: "Gizmo", style: "bottts" },
  { seed: "Spark", style: "bottts" }, { seed: "Cyber", style: "bottts" },
  { seed: "Nova", style: "adventurer" }, { seed: "Shadow", style: "adventurer" },
  { seed: "Hunter", style: "adventurer" }, { seed: "Mochi", style: "pixel-art" },
  { seed: "Bolt", style: "bottts" }, { seed: "Luna", style: "adventurer" },
  { seed: "Koda", style: "pixel-art" }, { seed: "Vex", style: "bottts" },
  { seed: "Rogue", style: "adventurer" }, { seed: "Chip", style: "pixel-art" },
  { seed: "Glitch", style: "bottts" }, { seed: "Finn", style: "adventurer" },
  { seed: "Zen", style: "pixel-art" }, { seed: "Neo", style: "bottts" },
  { seed: "Jade", style: "adventurer" }, { seed: "Pixel", style: "pixel-art" },
  { seed: "Byte", style: "bottts" }, { seed: "Sky", style: "adventurer" },
];

interface LeaderboardUser {
  name: string; style: string; seed: string; xp: number;
}

export default function Home() {
  // --- CORE STATES ---
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isHintModalOpen, setIsHintModalOpen] = useState(false);

  // --- PERSISTENT DATA ---
  const [xp, setXp] = useState<number>(0);
  const [userName, setUserName] = useState<string>("Guest");
  const [avatarConfig, setAvatarConfig] = useState(AVATAR_PRESETS[0]);
  const [streak, setStreak] = useState(0);

  // --- CHALLENGE STATES ---
  const [challenge, setChallenge] = useState<LinuxQuestion | null>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ text: string; type: 'cmd' | 'resp' }[]>([]);
  const [isSolved, setIsSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  // --- GLOBAL DATA ---
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardUser[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const MAX_ATTEMPTS = 5;

  // --- RANKING LOGIC ---
  const getRankInfo = (currentXp: number) => {
    const level = Math.floor(currentXp / 100) + 1;
    if (level >= 25) return { title: "Knight", color: "text-purple-400" };
    if (level >= 20) return { title: "Squire", color: "text-blue-400" };
    if (level >= 15) return { title: "Merchant", color: "text-emerald-400" };
    if (level >= 10) return { title: "Blacksmith", color: "text-orange-400" };
    if (level >= 5) return { title: "Peasant", color: "text-amber-600" };
    return { title: "Nobody", color: "text-slate-500" };
  };

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
      setHistory([{ text: solved ? "System: Session complete. Records archived." : "SSH Session Initialized. Awaiting command...", type: 'resp' }]);
    } catch {
      setHistory([{ text: "Error: Uplink failure.", type: 'resp' }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) { syncChallenge(userName); fetchRankings(); }
  }, [mounted, syncChallenge, userName, fetchRankings]);

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

  // --- HANDLERS ---
  const handleNameChange = () => {
    const newName = prompt("Enter your handle:", userName);
    if (newName && newName.trim() && newName !== userName) {
      const sanitized = newName.trim().substring(0, 15);
      setUserName(sanitized);
      localStorage.setItem("linuxly_name", sanitized);
      syncChallenge(sanitized);
    }
  };

  const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSolved || attempts >= MAX_ATTEMPTS || isChecking || e.key !== "Enter" || !challenge) return;
    const cmd = input.trim();
    if (!cmd) return;

    setIsChecking(true); setInput("");
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
      setHistory(prev => [...prev, { text: `${userName.toLowerCase()}@linuxly:~$ ${cmd}`, type: 'cmd' }, { text: `[SUCCESS] ${res.message} (+${gain} XP)`, type: 'resp' }]);
      fetchRankings();
    } else {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setHistory(prev => [...prev, { text: `${userName.toLowerCase()}@linuxly:~$ ${cmd}`, type: 'cmd' }, { text: nextAttempts >= MAX_ATTEMPTS ? "❌ LOCKOUT: Max attempts reached." : `❌ ${res.message}`, type: 'resp' }]);
    }
    setIsChecking(false);
  };

  const rotateAvatar = () => {
    const currentIndex = AVATAR_PRESETS.findIndex(p => p.seed === avatarConfig.seed);
    const nextIndex = (currentIndex + 1) % AVATAR_PRESETS.length;
    const nextConfig = AVATAR_PRESETS[nextIndex];
    setAvatarConfig(nextConfig);
    localStorage.setItem("linuxly_avatar_config", JSON.stringify(nextConfig));
  };

  if (!mounted) return <div className="min-h-screen bg-slate-950" />;

  const isGameOver = isSolved || attempts >= MAX_ATTEMPTS;
  const rank = getRankInfo(xp);

  return (
    <main className="min-h-screen bg-slate-950 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-8 font-sans text-slate-100 max-w-7xl mx-auto relative">
      
      {/* CUSTOM HINT MODAL */}
      {isHintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsHintModalOpen(false)} />
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl relative z-10 max-w-md w-full animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h4 className="text-xl font-bold tracking-tight">Accessing Intel</h4>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Analyzing the documentation may provide clarity, but it might not solve the puzzle for you. <span className="text-amber-400 font-semibold">Reward potential will drop to 12 XP</span> for this mission.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowHint(true); setIsHintModalOpen(false); }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20"
              >
                Proceed
              </button>
              <button 
                onClick={() => setIsHintModalOpen(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold py-3 rounded-xl transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden group">
          <div className="flex items-center gap-5 mb-6 relative z-10">
             <div className="relative">
               <img src={`https://api.dicebear.com/7.x/${avatarConfig.style}/svg?seed=${avatarConfig.seed}`} alt="avatar" className="w-20 h-20 rounded-2xl bg-slate-800 p-1 border-2 border-slate-700 shadow-lg" />
               <button onClick={rotateAvatar} className="absolute -bottom-2 -right-2 bg-emerald-500 p-1.5 rounded-lg border-2 border-slate-900 hover:bg-emerald-400 transition-colors">
                 <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
               </button>
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <h2 className="font-bold text-xl tracking-tight">{userName}</h2>
                 <button onClick={handleNameChange} className="text-slate-500 hover:text-emerald-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
               </div>
               <div className="flex gap-2 mt-1">
                 <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono uppercase">LVL {Math.floor(xp / 100) + 1}</span>
                 <span className={`text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 ${rank.color} font-mono uppercase font-bold tracking-widest`}>{rank.title}</span>
               </div>
             </div>
          </div>
          <div className="h-2 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-600 transition-all duration-1000" style={{ width: `${xp % 100}%` }} />
          </div>
          <div className="mt-3 text-[9px] font-mono text-slate-600 text-right uppercase">Skin ID: {AVATAR_PRESETS.findIndex(p => p.seed === avatarConfig.seed) + 1}</div>
        </div>

        <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 flex-1 overflow-hidden flex flex-col shadow-inner">
          <div className="bg-slate-900/80 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest font-mono">Leaderboard</h3>
            <span className="text-[10px] font-mono text-slate-600 px-2 py-1 bg-slate-950 rounded-md">{totalPlayers} active</span>
          </div>
          <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar">
            {globalLeaderboard.map((u, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${u.name === userName ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_15px_-5px_rgba(16,185,129,0.2)]' : 'bg-slate-900/50 border-transparent hover:border-slate-700'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-slate-600 w-4">{i + 1}.</span>
                  <img src={`https://api.dicebear.com/7.x/${u.style}/svg?seed=${u.seed}`} className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700" alt="" />
                  <span className={`text-sm font-medium ${u.name === userName ? 'text-emerald-400' : 'text-slate-300'}`}>{u.name}</span>
                </div>
                <span className="font-mono text-sm text-emerald-500 font-bold">{u.xp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          {loading ? (
            <div className="animate-pulse space-y-6"><div className="h-10 bg-slate-800 rounded w-3/4"></div><div className="h-20 bg-slate-800 rounded w-full"></div></div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg border ${challenge?.difficulty === 'easy' ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30'}`}>{challenge?.difficulty} Mission</span>
                  {streak >= 3 && (
                    <div className={`flex items-center gap-1.5 text-orange-500 font-bold drop-shadow-lg transition-transform duration-500 ${streak >= 10 ? 'scale-150 animate-pulse' : streak >= 5 ? 'scale-125' : 'scale-100'}`}>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                      <span className="text-xs font-mono">{streak}d</span>
                    </div>
                  )}
                </div>
                <a href={`https://tldr.inbrowser.app/pages/common/${getBaseCommand(challenge?.answers)}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-slate-500 hover:text-emerald-400 uppercase flex items-center gap-1 transition-colors tracking-tighter">LEARN MORE HERE! <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>
              </div>
              <h1 className="text-2xl md:text-4xl font-semibold mb-6 leading-tight text-slate-50 tracking-tight">{challenge?.question}</h1>
              {showHint && <div className="mb-6 p-5 bg-blue-500/5 border border-blue-500/20 rounded-2xl text-xs font-mono text-blue-300 leading-relaxed shadow-inner"><span className="text-blue-500 font-bold mr-2">HINT:</span>{challenge?.hint}</div>}
              <div className="pt-6 border-t border-slate-800 flex justify-between items-center">
                 {!isGameOver && !showHint && (
                   <button onClick={() => setIsHintModalOpen(true)} className="text-[10px] font-bold text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-1">
                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     Need Assistance?
                   </button>
                 )}
                 <div className="text-[10px] font-mono text-slate-600 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">UPLINK_RESET: <span className="text-slate-400">{timeLeft}</span></div>
              </div>
            </>
          )}
        </div>

        <div className="bg-[#0b0e14] rounded-3xl border border-slate-800 flex flex-col flex-1 min-h-[450px] shadow-2xl relative overflow-hidden group">
          <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center text-[10px] font-mono text-slate-600 uppercase tracking-widest">Console v2.4.1</div>
          <div className="p-6 overflow-y-auto font-mono text-sm space-y-2 flex-1 custom-scrollbar">
            {history.map((line, i) => (<div key={i} className={`leading-relaxed break-words ${line.type === 'resp' ? 'text-emerald-400' : 'text-slate-400'}`}>{line.text}</div>))}
            <div className="flex gap-3">
              <span className="text-emerald-500 font-bold shrink-0">{userName.toLowerCase()}@linuxly:~$</span>
              <input disabled={isGameOver || isChecking || loading} value={isGameOver ? "" : input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleCommand} className="bg-transparent outline-none flex-1 text-slate-100 placeholder:text-slate-800" placeholder={isGameOver ? "TERMINAL_LOCKED" : "waiting for input..."} autoFocus spellCheck={false} autoComplete="off" />
            </div>
            <div ref={terminalEndRef} />
          </div>
          <div className="px-6 py-3 bg-slate-900/30 border-t border-slate-800/50 flex justify-between items-center text-[9px] font-mono text-slate-600">
            <div>Attempts: {attempts}/{MAX_ATTEMPTS}</div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live Sync</div>
          </div>
        </div>
      </div>
    </main>
  );
}