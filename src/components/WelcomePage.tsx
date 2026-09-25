import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ShieldCheck, LogIn, ArrowRight, Loader2, Video, KeyRound, Sparkles } from 'lucide-react';
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
      
      const meetRef = doc(db, 'meetings', code);
      const meetSnap = await getDoc(meetRef);

      if (meetSnap.exists()) {
        onNavigateToJoin(code);
      } else {
        setErrorMessage("মিটিং কোডটি পাওয়া যায়নি। অনুগ্রহ করে সঠিক কোড দিন অথবা আপনার লিংকে সরাসরি প্রবেশ করুন।");
      }
    } catch (err) {
      setErrorMessage("নেটওয়ার্ক সমস্যার কারণে ভেরিফিকেশন সম্পন্ন হয়নি। দয়া করে আবার চেষ্টা করুন।");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-800 flex flex-col justify-center items-center p-4 sm:p-6 md:p-8 select-text font-sans">
      <div className="w-full max-w-md mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 overflow-hidden"
        >
          {/* Top Brand Accent Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600" />

          <div className="p-6 sm:p-8 space-y-6">
            {/* Header / Brand Identity */}
            <div className="text-center space-y-2.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200/80 text-emerald-700 rounded-full text-xs font-bold tracking-wide">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>UNITY EARNING</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                কাউন্সেলিং মিটিং সিস্টেম
              </h1>
              
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
                রিয়েল-টাইম সুরক্ষিত অনবোর্ডিং প্ল্যাটফর্ম। কাউন্সেলর ও শিক্ষার্থীদের জন্য অফিসিয়াল সেশন পোর্টাল।
              </p>
            </div>

            {/* Main Interactive Join Card */}
            <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Video className="h-4 w-4" />
                </div>
                <span>সেশনে সরাসরি যোগ দিন</span>
              </div>
              
              {errorMessage && (
                <div className="bg-rose-50 border border-rose-200/90 p-3 rounded-xl text-xs text-rose-700 font-medium leading-relaxed">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleVerifyAndJoin} className="space-y-3">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="মিটিং কোড টাইপ করুন (যেমন: meet_abc)"
                    value={meetingCode}
                    onChange={(e) => setMeetingCode(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 rounded-xl transition shadow-xs"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isVerifying || !meetingCode.trim()}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-bold rounded-xl shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>যাচাই করা হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <span>মিটিংয়ে প্রবেশ করুন</span>
                      <ArrowRight className="h-4 w-4 text-white" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Quick Links & Trust Actions */}
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={onNavigateToAdmin}
                className="w-full px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/90 shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <LogIn className="h-4 w-4 text-blue-600" />
                <span>ম্যানেজমেন্ট লগইন (অ্যাডমিন)</span>
              </button>

              <div className="flex items-center gap-3 p-3 bg-slate-50/60 rounded-xl border border-slate-200/60">
                <div className="h-8 w-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <h3 className="text-xs font-bold text-slate-800">স্বয়ংক্রিয় আইপি নিরাপত্তা সক্রিয়</h3>
                  <p className="text-[11px] text-slate-500 font-medium">নিরাপদ ও অনুমোদিত সংযোগ দ্বারা সুরক্ষিত</p>
                </div>
              </div>
            </div>

          </div>
        </motion.div>

        {/* Quiet Footer */}
        <p className="text-center text-xs text-slate-400 mt-5 font-medium">
          © {new Date().getFullYear()} Unity Earning. সর্বস্বত্ব সংরক্ষিত।
        </p>
      </div>
    </div>
  );
}
