"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { 
  verifyAndSubmit, 
  getDailyStatsAction,
  getDailyChallengeAction, 
  checkSolveStatus,
  LinuxQuestion 
} from "./actions";

import { getWeeklyRecapAction, WeekDay } from "./weekly-actions";

interface DailyStats {
  totalUsers: number;
  solved: number;
  failed: number;
  attemptsDist: number[];
  solvedWithHint: number;
  solvedWithoutHint: number;
}

export default function Home() {
  // --- CORE STATES ---
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isHintModalOpen, setIsHintModalOpen] = useState(false);

  // --- PERSISTENT DATA ---
  const [userId, setUserId] = useState<string>("");

  // --- CHALLENGE STATES ---
  const [challenge, setChallenge] = useState<LinuxQuestion | null>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ text: string; type: 'cmd' | 'resp' }[]>([]);
  const [isSolved, setIsSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  // --- GLOBAL DATA ---
  const [dailyStats, setDailyStats] = useState<DailyStats>({ 
    totalUsers: 0, solved: 0, failed: 0, attemptsDist: [0,0,0,0,0], solvedWithHint: 0, solvedWithoutHint: 0 
  });
  const [weeklyRecap, setWeeklyRecap] = useState<WeekDay[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const MAX_ATTEMPTS = 5;

  const getBaseCommand = (answers: string[] | undefined) => {
    if (!answers || answers.length === 0) return "";
    return answers[0].split(" ")[0];
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Background ID tracking for unique solves without forcing users to pick a name
      let sUserId = localStorage.getItem("linuxly_user_id");
      if (!sUserId) {
        sUserId = Math.random().toString(36).substring(2, 15);
        localStorage.setItem("linuxly_user_id", sUserId);
      }
      setUserId(sUserId);

      const sAttemptsDate = localStorage.getItem("linuxly_attempts_date");
      const sAttempts = localStorage.getItem("linuxly_attempts");
      
      const today = new Date().toDateString();
      if (sAttemptsDate === today && sAttempts) {
        setAttempts(parseInt(sAttempts));
      } else {
        localStorage.setItem("linuxly_attempts_date", today);
        localStorage.setItem("linuxly_attempts", "0");
      }

      setMounted(true);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const stats = await getDailyStatsAction();
    if (stats) setDailyStats(stats);
  }, []);

  const syncChallenge = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const daily = await getDailyChallengeAction();
      const solved = await checkSolveStatus(id);
      setChallenge(daily);
      setIsSolved(solved);
      setHistory([{ text: solved ? "System: Session complete. Records archived." : "SSH Session Initialized. Awaiting command...", type: 'resp' }]);
    } catch {
      setHistory([{ text: "Error: Uplink failure.", type: 'resp' }]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeeklyRecap = useCallback(async (id: string) => {
    if (!id) return;
    const recap = await getWeeklyRecapAction(id);
    setWeeklyRecap(recap);
  }, []);

  useEffect(() => {
    if (mounted && userId) { 
      syncChallenge(userId); 
      fetchStats();
      fetchWeeklyRecap(userId);
    }
  }, [mounted, userId, syncChallenge, fetchStats, fetchWeeklyRecap]);

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
  const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSolved || attempts >= MAX_ATTEMPTS || isChecking || e.key !== "Enter" || !challenge) return;
    const cmd = input.trim();
    if (!cmd) return;

    setIsChecking(true); setInput("");
    const currentAttempt = attempts + 1;
    
    const res = await verifyAndSubmit(challenge.id, cmd, userId, currentAttempt, showHint);

    if (res.success) {
      setIsSolved(true);
      setHistory(prev => [...prev, { text: `operator@linuxly:~$ ${cmd}`, type: 'cmd' }, { text: `[SUCCESS] ${res.message}`, type: 'resp' }]);
      fetchStats();
    } else {
      setAttempts(currentAttempt);
      localStorage.setItem("linuxly_attempts", currentAttempt.toString());
      setHistory(prev => [...prev, { text: `operator@linuxly:~$ ${cmd}`, type: 'cmd' }, { text: currentAttempt >= MAX_ATTEMPTS ? "❌ LOCKOUT: Max attempts reached." : `❌ ${res.message}`, type: 'resp' }]);
      if (currentAttempt >= MAX_ATTEMPTS) fetchStats(); 
    }
    setIsChecking(false);
  };

  if (!mounted) return <div className="min-h-screen bg-slate-950" />;

  const isGameOver = isSolved || attempts >= MAX_ATTEMPTS;

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
            {/* UPDATED HINT TEXT */}
            <p className="text-slate-400 text-sm leading-relaxed mb-6 font-semibold">
              Think harder before using hint!
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

      {/* SIDEBAR: DAILY GLOBAL STATS UI */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 flex-1 overflow-hidden flex flex-col shadow-inner">
          <div className="bg-slate-900/80 px-6 py-4 border-b border-slate-800 flex flex-col gap-1">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest font-mono">Global Stats</h3>
            <span className="text-[10px] font-mono text-slate-500">See how others fare to today&apos;s question</span>
          </div>
          
          <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
            {/* Operator Count */}
            <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Operators</span>
               <span className="text-lg font-mono text-emerald-400">{dailyStats.totalUsers}</span>
            </div>

            {/* Success & Failure Rates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 flex flex-col items-center justify-center">
                <span className="text-[10px] text-emerald-500/70 font-bold uppercase tracking-widest mb-1">Success</span>
                <span className="text-3xl font-mono text-emerald-400">
                  {dailyStats.totalUsers > 0 ? Math.round((dailyStats.solved / dailyStats.totalUsers) * 100) : 0}%
                </span>
              </div>
              <div className="bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20 flex flex-col items-center justify-center">
                <span className="text-[10px] text-rose-500/70 font-bold uppercase tracking-widest mb-1">Failed</span>
                <span className="text-3xl font-mono text-rose-400">
                  {dailyStats.totalUsers > 0 ? Math.round((dailyStats.failed / dailyStats.totalUsers) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* NEW: Hint Usage Comparison */}
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
               <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Solve Intelligence</h4>
               <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                 <span>Without Hint</span>
                 <span>With Hint</span>
               </div>
               <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-900 border border-slate-800">
                 <div className="bg-emerald-500 transition-all duration-1000" style={{ width: `${dailyStats.solved > 0 ? (dailyStats.solvedWithoutHint / dailyStats.solved) * 100 : 50}%` }}></div>
                 <div className="bg-blue-500/80 transition-all duration-1000" style={{ width: `${dailyStats.solved > 0 ? (dailyStats.solvedWithHint / dailyStats.solved) * 100 : 50}%` }}></div>
               </div>
               <div className="flex justify-between text-xs font-mono mt-2">
                 <span className="text-emerald-400">{dailyStats.solvedWithoutHint}</span>
                 <span className="text-blue-400">{dailyStats.solvedWithHint}</span>
               </div>
            </div>

            {/* Attempts Breakdown Chart */}
            <div className="pt-2">
               <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Solves by Attempt Count</h4>
               <div className="space-y-3">
                 {dailyStats.attemptsDist.map((count, index) => {
                    const percentage = dailyStats.solved > 0 ? Math.round((count / dailyStats.solved) * 100) : 0;
                    return (
                      <div key={index} className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-slate-400 w-12 text-right">Try {index + 1}</span>
                        <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500/50 transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
                        </div>
                        <span className="text-slate-500 w-8">{count}</span>
                      </div>
                    )
                 })}
               </div>
            </div>
          </div>
        </div>

        {/* WEEKLY RECAP */}
        {weeklyRecap.length > 0 && (
          <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 overflow-hidden shadow-inner">
            <div className="bg-slate-900/80 px-6 py-4 border-b border-slate-800 flex flex-col gap-1">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest font-mono">Weekly Recap</h3>
              <span className="text-[10px] font-mono text-slate-500">Last 7 days of missions</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {weeklyRecap.map((day) => {
                const isExpanded = expandedDay === day.dateStr;
                const s = day.stats;
                const wrongPct      = s.totalUsers   > 0 ? Math.round((s.failed           / s.totalUsers) * 100) : 0;
                const successPct    = s.totalUsers   > 0 ? Math.round((s.solved           / s.totalUsers) * 100) : 0;

                const dotColor =
                  day.userResult === true  ? 'bg-emerald-500' :
                  day.userResult === false ? 'bg-amber-500'   :
                                             'bg-slate-600';
                const rowBg =
                  day.userResult === true  ? 'hover:bg-emerald-500/5' :
                  day.userResult === false ? 'hover:bg-amber-500/5'   :
                                             'hover:bg-slate-800/30';

                return (
                  <div key={day.dateStr}>
                    {/* Clickable row */}
                    <button
                      onClick={() => setExpandedDay(isExpanded ? null : day.dateStr)}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${rowBg} group`}
                    >
                      {/* Status dot */}
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />

                      {/* Date label */}
                      <span className="text-[11px] font-mono text-slate-400 w-20 shrink-0">{day.label}</span>

                      {/* Question truncated */}
                      <span className="text-[11px] text-slate-300 flex-1 truncate font-medium">
                        {day.questionName}
                      </span>

                      {/* Difficulty badge */}
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border shrink-0 ${
                        day.difficulty === 'easy'   ? 'text-emerald-400 border-emerald-500/30' :
                        day.difficulty === 'medium' ? 'text-amber-400   border-amber-500/30'   :
                        day.difficulty === 'hard'   ? 'text-rose-400    border-rose-500/30'     :
                                                      'text-purple-400  border-purple-500/30'
                      }`}>{day.difficulty}</span>

                      {/* Chevron */}
                      <svg
                        className={`w-3 h-3 text-slate-600 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded stats */}
                    {isExpanded && (
                      <div className="bg-slate-950/60 px-5 py-4 border-t border-slate-800/60 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">

                        {/* Participation row */}
                        <div className="flex justify-between text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                          <span>{s.totalUsers} operators</span>
                          <span className="text-emerald-400">{successPct}% solved</span>
                          <span className="text-rose-400">{wrongPct}% failed</span>
                        </div>

                        {/* Solve intelligence bar  (------XXYYYYY) style */}
                        <div>
                          <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest">
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/40" /> w/ Hint
                            </span>
                            <span className="flex items-center gap-1">
                              No Hint <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />
                            </span>
                            <span className="flex items-center gap-1">
                              Wrong <span className="inline-block w-2 h-2 rounded-sm bg-rose-500/60" />
                            </span>
                          </div>
                          <div className="flex h-3 rounded-full overflow-hidden bg-slate-900 border border-slate-800 w-full">
                            {/* solved with hint  = dashed/muted green */}
                            <div
                              className="bg-emerald-500/40 transition-all duration-700"
                              style={{ width: `${s.totalUsers > 0 ? (s.solvedWithHint / s.totalUsers) * 100 : 0}%` }}
                            />
                            {/* solved without hint = solid green */}
                            <div
                              className="bg-emerald-500 transition-all duration-700"
                              style={{ width: `${s.totalUsers > 0 ? (s.solvedWithoutHint / s.totalUsers) * 100 : 0}%` }}
                            />
                            {/* wrong = rose */}
                            <div
                              className="bg-rose-500/60 transition-all duration-700"
                              style={{ width: `${s.totalUsers > 0 ? (s.failed / s.totalUsers) * 100 : 0}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] font-mono mt-1.5">
                            <span className="text-emerald-400/70">{s.solvedWithHint} hint</span>
                            <span className="text-emerald-400">{s.solvedWithoutHint} clean</span>
                            <span className="text-rose-400/70">{s.failed} failed</span>
                          </div>
                        </div>

                        {/* Attempts distribution */}
                        <div>
                          <h4 className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Solves by Attempt</h4>
                          <div className="space-y-1.5">
                            {s.attemptsDist.map((count, idx) => {
                              const pct = s.solved > 0 ? Math.round((count / s.solved) * 100) : 0;
                              return (
                                <div key={idx} className="flex items-center gap-2 text-[10px] font-mono">
                                  <span className="text-slate-500 w-10 text-right shrink-0">Try {idx + 1}</span>
                                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500/50 transition-all duration-700"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-slate-600 w-6 shrink-0">{count}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        
        {/* MISSION PANEL */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          {loading ? (
            <div className="animate-pulse space-y-6"><div className="h-10 bg-slate-800 rounded w-3/4"></div><div className="h-20 bg-slate-800 rounded w-full"></div></div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-6">
                <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg border ${challenge?.difficulty === 'easy' ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30'}`}>
                  {challenge?.difficulty} Mission
                </span>
                <a href={`https://tldr.inbrowser.app/pages/common/${getBaseCommand(challenge?.answers)}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-slate-500 hover:text-emerald-400 uppercase flex items-center gap-1 transition-colors tracking-tighter">LEARN MORE HERE! <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>
              </div>
              <h1 className="text-2xl md:text-4xl font-semibold mb-6 leading-tight text-slate-50 tracking-tight">{challenge?.question}</h1>
              {showHint && <div className="mb-6 p-5 bg-blue-500/5 border border-blue-500/20 rounded-2xl text-xs font-mono text-blue-300 leading-relaxed shadow-inner"><span className="text-blue-500 font-bold mr-2">HINT_DECRYPTED:</span>{challenge?.hint}</div>}
              <div className="pt-6 border-t border-slate-800 flex justify-between items-center">
                 {!isGameOver && !showHint && (
                   <button onClick={() => setIsHintModalOpen(true)} className="text-[10px] font-bold text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-1">
                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     Request Intelligence
                   </button>
                 )}
                 <div className="text-[10px] font-mono text-slate-600 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">UPLINK_RESET: <span className="text-slate-400">{timeLeft}</span></div>
              </div>
            </>
          )}
        </div>

        {/* TERMINAL */}
        <div className="bg-[#0b0e14] rounded-3xl border border-slate-800 flex flex-col flex-1 min-h-[450px] shadow-2xl relative overflow-hidden group">
          <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center text-[10px] font-mono text-slate-600 uppercase tracking-widest">Console v2.4.1</div>
          <div className="p-6 overflow-y-auto font-mono text-sm space-y-2 flex-1 custom-scrollbar">
            {history.map((line, i) => (<div key={i} className={`leading-relaxed break-words ${line.type === 'resp' ? 'text-emerald-400' : 'text-slate-400'}`}>{line.text}</div>))}
            <div className="flex gap-3">
              <span className="text-emerald-500 font-bold shrink-0">operator@linuxly:~$</span>
              <input disabled={isGameOver || isChecking || loading} value={isGameOver ? "" : input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleCommand} className="bg-transparent outline-none flex-1 text-slate-100 placeholder:text-slate-800" placeholder={isGameOver ? "TERMINAL_LOCKED" : "waiting for input..."} autoFocus spellCheck={false} autoComplete="off" />
            </div>
            <div ref={terminalEndRef} />
          </div>
          <div className="px-6 py-3 bg-slate-900/30 border-t border-slate-800/50 flex justify-between items-center text-[9px] font-mono text-slate-600">
            <div>Attempts: {attempts}/{MAX_ATTEMPTS}</div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live Sync</div>
          </div>
        </div>

        {/* INTEL UNLOCKED BOX */}
        {isSolved && challenge && (challenge.addinfo1 || challenge.usecase) && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-xl font-bold text-emerald-400 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Command Intelligence Unlocked
            </h3>

            <div className="space-y-6">
              {(challenge.addinfo1 || challenge.addinfo2) && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Advanced Usage</h4>
                  <div className="space-y-3">
                    {challenge.addinfo1 && (
                      <div className="bg-[#0b0e14] p-4 rounded-2xl border border-slate-800 text-sm text-slate-300 leading-relaxed">
                        <span className="text-emerald-500 font-bold mr-3">&gt;</span>{challenge.addinfo1}
                      </div>
                    )}
                    {challenge.addinfo2 && (
                      <div className="bg-[#0b0e14] p-4 rounded-2xl border border-slate-800 text-sm text-slate-300 leading-relaxed">
                        <span className="text-emerald-500 font-bold mr-3">&gt;</span>{challenge.addinfo2}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {challenge.usecase && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Field Application</h4>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-5 rounded-2xl text-sm leading-relaxed text-emerald-100/80 shadow-inner">
                    <span className="text-emerald-400 font-bold mr-2 uppercase tracking-wide">Use_Case:</span>
                    {challenge.usecase}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}