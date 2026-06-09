import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ShieldCheck, LogIn, ArrowRight, Loader2, Video } from 'lucide-react';
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
      const code = meetingCode.trim().replaceAll('join/', '').replaceAll('/', ''); // handles copy-paste of paths
      
      const meetRef = doc(db, 'meetings', code);
      const meetSnap = await getDoc(meetRef);

      if (meetSnap.exists()) {
        onNavigateToJoin(code);
      } else {
        setErrorMessage("মিটিং কোডটি সঠিক নয়। অনুগ্রহ করে কোডটি পুনরায় যাচাই করে আবার চেষ্টা করুন।");
      }
    } catch (err) {
      setErrorMessage("নেটওয়ার্ক কানেকশন সমস্যা। অনুগ্রহ করে আবার চেষ্টা করুন।");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 flex flex-col justify-center items-center p-0 md:p-6 select-text overflow-x-hidden">
      
      {/* PHONE FRAME CHASSIS (Desktop Only) */}
      <div className="w-full min-h-screen md:min-h-[820px] md:max-w-[400px] md:h-[820px] md:border-[12px] md:border-slate-850 md:rounded-[48px] md:shadow-2xl bg-slate-50 flex flex-col relative overflow-hidden">
        
        {/* PHONE NOTCH / STATUS BAR (Desktop Only) */}
        <div className="hidden md:flex absolute top-0 inset-x-0 h-9 bg-slate-900 justify-between items-center px-6 z-50 text-[10px] text-slate-400 font-mono">
          <span>09:21 AM</span>
          <div className="w-24 h-4 bg-black rounded-b-2xl absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
            <div className="w-3 h-1.5 bg-[#1e293b] rounded-full"></div>
          </div>
          <div className="flex items-center gap-1.5">
            <span>5G</span>
            <div className="w-4 h-2 opacity-80 border border-slate-400 rounded-sm p-[1px] flex items-center">
              <div className="bg-slate-400 h-full w-2"></div>
            </div>
          </div>
        </div>

        {/* MAIN SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto pt-6 md:pt-14 pb-8 px-5 flex flex-col justify-between bg-slate-50">
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col justify-between space-y-6"
          >
            {/* Header / Brand */}
            <div className="text-center space-y-3 pt-2">
              <span className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                Unity Earning কাউন্সেলিং ওয়েবসাইট
              </span>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-short">
                কাউন্সেলিং মিটিং সিস্টেম
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                রিয়েল-টাইম সুরক্ষিত অনবোর্ডিং পোর্টাল। কাউন্সেলর এবং নিবন্ধিত শিক্ষার্থীদের জন্য অফিসিয়াল ওয়েবসাইট।
              </p>
            </div>

            {/* Form Segment */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Video className="h-4.5 w-4.5 text-amber-555 text-amber-500 shrink-0" />
                <h2>সক্রিয় কাউন্সেলিং সেশনে যোগ দিন</h2>
              </div>
              
              {errorMessage && (
                <p className="text-xs text-red-600 font-medium bg-red-50 p-2.5 border border-red-200 rounded-lg">
                  {errorMessage}
                </p>
              )}

              <form onSubmit={handleVerifyAndJoin} className="space-y-3">
                <input
                  type="text"
                  required
                  placeholder="মিটিং কোড দিন (যেমন: meet_abc)"
                  value={meetingCode}
                  onChange={(e) => setMeetingCode(e.target.value)}
                  className="w-full px-4 py-3 bg-[#fcfcfc] border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition animate-none"
                />
                
                <button
                  type="submit"
                  disabled={isVerifying || !meetingCode.trim()}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-amber-400 text-xs font-black rounded-xl shadow transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  ) : (
                    <>
                      <span>মিটিংয়ে প্রবেশ করুন</span>
                      <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Trust and Actions */}
            <div className="space-y-4 pt-2">
              <button
                onClick={onNavigateToAdmin}
                className="w-full px-4 py-3 bg-white hover:bg-slate-50 hover:text-slate-900 transition text-slate-600 font-bold text-xs rounded-xl border border-slate-200 shadow-sm flex items-center justify-center gap-2 group cursor-pointer"
              >
                <LogIn className="h-4 w-4 text-slate-400 group-hover:text-amber-500 transition" />
                <span>ম্যানেজমেন্ট লগইন (অ্যাডমিন)</span>
              </button>

              <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
                <div className="h-8 w-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4.5 w-4.5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800">আইপি নিরাপত্তা সক্রিয় আছে</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">যেকোনো অনাকাঙ্ক্ষিত অ্যাক্সেস প্রতিহত করা হয়</p>
                </div>
              </div>
            </div>

          </motion.div>
          
        </div>

        {/* HOME INDICATOR (Desktop Only) */}
        <div className="hidden md:block absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-400 rounded-full opacity-60"></div>

      </div>
    </div>
  );
}
