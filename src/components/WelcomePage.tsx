import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import * as dbService from '../dbService';
import {
  LogIn,
  ArrowRight,
  Loader2,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'motion/react';

interface WelcomePageProps {
  onNavigateToAdmin: () => void;
  onNavigateToJoin: (meetingId: string) => void;
}

export default function WelcomePage({ onNavigateToAdmin, onNavigateToJoin }: WelcomePageProps) {
  const [meetingCode, setMeetingCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleVerifyAndJoin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    if (!meetingCode.trim()) return;

    try {
      setIsVerifying(true);
      const code = meetingCode.trim().replaceAll('join/', '').replaceAll('/', '');

      const sMeeting = await dbService.getMeetingById(code);
      if (sMeeting) {
        onNavigateToJoin(code);
        return;
      }

      const meetRef = doc(db, 'meetings', code);
      const meetSnap = await getDoc(meetRef);

      if (meetSnap.exists()) {
        onNavigateToJoin(code);
      } else {
        setErrorMessage('Meeting code not found. Please check your code or use your direct invitation link.');
      }
    } catch {
      setErrorMessage('Verification failed due to a network issue. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-[#111827] flex flex-col justify-center items-center p-4 sm:p-6 select-text font-sans">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] mx-auto space-y-4"
      >
        {/* PRIMARY JOIN CARD */}
        <div className="bg-white border border-[#e6eaf0] rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)] space-y-5">
          <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3.5">
            <div>
              <span className="text-[11px] font-bold text-[#0b4a8b] uppercase tracking-wider">
                Unity Earning
              </span>
              <h1 className="text-lg font-extrabold text-[#111827] mt-0.5">
                Join Counselling Session
              </h1>
            </div>
            <span className="bg-[#ddf1fa] text-[#0b4a8b] px-2.5 py-1 rounded-md text-[10.5px] font-bold shrink-0">
              Live Portal
            </span>
          </div>

          {errorMessage && (
            <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-xl p-3.5 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-[#f59e0b] shrink-0 mt-0.5" />
              <p className="text-xs text-[#78350f] font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}

          <form onSubmit={handleVerifyAndJoin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#334155]">
                Meeting Code
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748b]">
                  <KeyRound className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Enter meeting code (e.g. meet_abc)"
                  value={meetingCode}
                  onChange={(e) => setMeetingCode(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#f8fafc] border border-[#cbd5e1] text-[#111827] placeholder-[#94a3b8] text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] focus:bg-white rounded-xl transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifying || !meetingCode.trim()}
              className="w-full py-3.5 px-4 bg-[#0b4a8b] hover:bg-[#093c72] disabled:bg-slate-200 disabled:text-slate-400 disabled:pointer-events-none text-white text-sm font-extrabold rounded-xl shadow-[0_2px_8px_rgba(11,74,139,0.2)] transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Enter Meeting</span>
                  <ArrowRight className="h-4 w-4 text-white" />
                </>
              )}
            </button>
          </form>

          <div className="pt-3 border-t border-[#f1f5f9] flex items-center justify-between">
            <span className="text-xs text-[#64748b] font-medium">
              Are you an administrator?
            </span>
            <button
              type="button"
              onClick={onNavigateToAdmin}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0b4a8b] hover:underline cursor-pointer"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Admin Login</span>
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-[#64748b] font-medium">
          © {new Date().getFullYear()} Unity Earning. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
