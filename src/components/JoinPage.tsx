import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { AlertCircle, User, Loader2, CheckCircle, ShieldAlert, Bell } from 'lucide-react';
import { motion } from 'motion/react';

const Marquee = 'marquee' as any;

interface JoinPageProps {
  meetingId: string;
}

export default function JoinPage({ meetingId }: JoinPageProps) {
  const [fullName, setFullName] = useState('');
  const [ipAddress, setIpAddress] = useState<string>('যাচাই হচ্ছে...');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState<boolean | null>(null);
  const [isVPN, setIsVPN] = useState<boolean>(false);
  const [alreadyJoined, setAlreadyJoined] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [googleMeetLink, setGoogleMeetLink] = useState<string | null>(null);
  const [meetingActive, setMeetingActive] = useState<boolean>(true);
  const [meetingDate, setMeetingDate] = useState<string | null>(null);
  const [meetingTime, setMeetingTime] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string>('');
  const [noticeActive, setNoticeActive] = useState<boolean>(false);

  // 1. Live Listeners for Meeting, Block Status, and Settings
  useEffect(() => {
    let unsubMeeting: (() => void) | null = null;
    let unsubBlockIP: (() => void) | null = null;
    let unsubBlockDevice: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    async function setupListeners() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        // A. Persistent Device ID (Hardware Fingerprint Substitute)
        let dId = localStorage.getItem('unity_device_id');
        if (!dId) {
          dId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
          localStorage.setItem('unity_device_id', dId);
        }
        setDeviceId(dId);

        // B. Fetch IP and Security Check
        let detectedIp = 'Unknown';
        try {
          // Primarily use ipify as it's highly reliable and has high limits
          const ipRes = await fetch('https://api.ipify.org?format=json');
          if (ipRes.ok) {
            const ipData = await ipRes.json();
            detectedIp = ipData.ip;
          }
        } catch (ipErr) {
          console.warn("IP fetch failed", ipErr);
        }
        setIpAddress(detectedIp);

        // Security Check (Async)
        // Only run detailed metadata if ipify worked
        if (detectedIp !== 'Unknown' && detectedIp !== 'যাচাই হচ্ছে...') {
          fetch(`https://ipapi.co/${detectedIp}/json/`)
            .then(res => res.json())
            .then(meta => {
              const org = (meta.org || '').toLowerCase();
              const asn = (meta.asn || '').toLowerCase();
              const hostingKeywords = ['amazon', 'google', 'digitalocean', 'ovh', 'linode', 'vultr', 'm247', 'pax8', 'hosting', 'datacenter', 'proxy', 'vpn', 'cloudflare'];
              if (hostingKeywords.some(kw => org.includes(kw) || asn.includes(kw))) {
                setIsVPN(true);
                setIsBlocked(true);
              }
            }).catch(() => {});
        }

        // C. Real-time Block Listeners
        unsubBlockIP = onSnapshot(doc(db, 'blockedIPs', (detectedIp === 'Unknown' || detectedIp === 'যাচাই হচ্ছে...') ? 'temp' : detectedIp), (snap) => {
          if (snap.exists()) setIsBlocked(true);
        });

        if (dId) {
          unsubBlockDevice = onSnapshot(doc(db, 'blockedDevices', dId), (snap) => {
            if (snap.exists()) setIsBlocked(true);
          });
        }

        // D. Real-time Meeting Details Listener
        unsubMeeting = onSnapshot(doc(db, 'meetings', meetingId), (snap) => {
          if (snap.exists()) {
            const mData = snap.data();
            setGoogleMeetLink(mData.googleMeetLink);
            setMeetingActive(mData.active !== false);
            setMeetingDate(mData.meetingDate || null);
            setMeetingTime(mData.meetingTime || null);
            setErrorMessage(null); 
          } else {
            setErrorMessage("কাউন্সেলিং মিটিং সেশনটি খুঁজে পাওয়া যায়নি। আপনার লিঙ্কের মিটিং আইডি চেক করুন।");
          }
        }, (err) => {
          console.error("Meeting listener error:", err);
          setErrorMessage("মিটিং ডাটা লোড করতে সমস্যা হচ্ছে। আপনার ইন্টারনেট কানেকশন বা সার্ভার পারমিশন চেক করুন।");
        });

        // D. Real-time Admin Settings Listener (Notice only)
        unsubSettings = onSnapshot(doc(db, 'adminSettings', 'settings'), (snap) => {
          if (snap.exists()) {
            const sData = snap.data();
            setNoticeText(sData.noticeText || '');
            setNoticeActive(sData.noticeActive === true);
          }
          setIsLoading(false);
        }, (err) => {
          console.error("Settings listener error:", err);
          setIsLoading(false);
        });

      } catch (err: any) {
        console.error('Initialization error:', err);
        setErrorMessage('নিরাপত্তা ব্যবস্থা যাচাই করতে ব্যর্থ হয়েছে। পেজ রিফ্রেশ করুন।');
        setIsLoading(false);
      }
    }

    setupListeners();

    return () => {
      if (unsubMeeting) unsubMeeting();
      if (unsubBlockIP) unsubBlockIP();
      if (unsubBlockDevice) unsubBlockDevice();
      if (unsubSettings) unsubSettings();
    };
  }, [meetingId]);

  // 2. Submit join request
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    if (!ipAddress) {
      setErrorMessage("আপনার ডিভাইস আইপি শনাক্ত করা সম্ভব হয়নি। মিটিংয়ে যোগ দেওয়ার জন্য সিকিউরিটি ভেরিফিকেশন আবশ্যক।");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // 1. Double check block status locally (already tracked by listeners, but for safety)
      if (isBlocked) {
        setIsSubmitting(false);
        return;
      }

      // 2. Perform one final quick block check from DB
      if (ipAddress && ipAddress !== 'Unknown') {
        try {
          const blockSnap = await getDoc(doc(db, 'blockedIPs', ipAddress));
          if (blockSnap.exists()) {
            setIsBlocked(true);
            setIsSubmitting(false);
            return;
          }
        } catch (e) {
          console.warn("DB block check failed, continuing join flow", e);
        }
      }

      // 3. Create Participant Entry
      const participantId = `part_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const pRef = doc(db, 'participants', participantId);
      
      const payload = {
        name: fullName.trim(),
        meetingId: meetingId,
        ip: ipAddress || 'Unknown',
        deviceId: deviceId || 'Unknown',
        userAgent: navigator.userAgent || 'Unknown Browser',
        joinedAt: serverTimestamp(),
        blocked: false
      };

      // Try to save participant record
      let saveSuccessful = false;
      try {
        await setDoc(pRef, payload);
        saveSuccessful = true;
      } catch (err: any) {
        console.error("Failed to log participant:", err);
        // If it's just a logging failure, we might still want to allow the redirect
        // if the meeting is active and we have a link.
      }

      // 4. Validate redirection requirements
      if (!meetingActive) {
        setErrorMessage("এই কাউন্সেলিং সেশনটি বৰ্তমানে নিষ্ক্রিয় বা সম্পন্ন করা হয়েছে।");
        setIsSubmitting(false);
        return;
      }

      if (!googleMeetLink) {
        setErrorMessage("গুগল মিট (Google Meet) লিংকটি এখনও কাউন্সেলিং সেশনে যুক্ত করা হয়নি।");
        setIsSubmitting(false);
        return;
      }

      // Prepare final redirect URL
      let redirectUrl = googleMeetLink.trim();
      if (!/^https?:\/\//i.test(redirectUrl)) {
        redirectUrl = 'https://' + redirectUrl;
      }

      // Final redirect
      window.location.assign(redirectUrl);

    } catch (err: any) {
      console.error("Global join error:", err);
      setErrorMessage('সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। অনুগ্রহ করে ইন্টারনেট চেক করে আবার চেষ্টা করুন।');
      setIsSubmitting(false);
    }
  }

  // Formatting meeting date and time into elegant Bengali
  function formatMeetingDateTime(dateStr?: string, timeStr?: string) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const monthsBg = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
        const monthIndex = parseInt(month, 10) - 1;
        const monthBg = monthsBg[monthIndex] || month;
        
        // Bengali digit converter
        const bgDigits: { [key: string]: string } = {
          '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
          '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'
        };
        const toBgNum = (numStr: string) => numStr.split('').map(char => bgDigits[char] || char).join('');
        
        let formattedTime = '';
        if (timeStr) {
          const tParts = timeStr.split(':');
          if (tParts.length >= 2) {
            let hour = parseInt(tParts[0], 10);
            const minute = tParts[1];
            let ampm = 'সকাল';
            if (hour >= 12) {
              ampm = 'বিকাল';
              if (hour > 12) hour -= 12;
            } else {
              if (hour === 0) hour = 12;
              if (hour >= 6 && hour < 12) ampm = 'সকাল';
              else ampm = 'রাত';
            }
            formattedTime = `, ${ampm} ${toBgNum(String(hour))}:${toBgNum(minute)} মিনিট`;
          }
        }
        
        return `${toBgNum(day)} ${monthBg} ${toBgNum(year)} ${formattedTime}`;
      }
    } catch (e) {
      console.warn("Date parsing error", e);
    }
    return `${dateStr} ${timeStr || ''}`;
  }

  // --- RENDERING MAIN WITH PHONE FRAME ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 flex flex-col justify-center items-center p-0 md:p-6 select-text overflow-x-hidden">
      
      {/* PHONE FRAME CHASSIS (Desktop Only) */}
      <div className="w-full min-h-screen md:min-h-[820px] md:max-w-[400px] md:h-[820px] md:border-[12px] md:border-slate-850 md:rounded-[48px] md:shadow-2xl bg-white flex flex-col relative overflow-hidden">
        
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

        {/* LOADING STATE */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 space-y-4 pt-14 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
            <p className="text-slate-600 font-semibold text-sm">
              নিরাপত্তা ব্যবস্থা এবং আইপি অ্যাড্রেস যাচাই করা হচ্ছে...
            </p>
          </div>
        )}

        {/* BLOCKED ACCESS-DENIED SCREEN */}
        {!isLoading && isBlocked && (
          <div className="flex-1 flex flex-col justify-between p-6 bg-slate-50 pt-14">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 text-center pt-8"
            >
              <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100">
                <ShieldAlert className="h-10 w-10 text-red-500" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-rose-600 tracking-tight">অ্যাক্সেস অস্বীকৃত হয়েছে</h1>
                
                {isVPN ? (
                  <p className="text-slate-600 text-xs leading-relaxed px-2">
                    নিরাপত্তা জনিত কারণে <span className="font-bold text-red-600 underline">VPN বা প্রক্সি</span> ব্যবহার করে মিটিংয়ে জয়েন করা নিষিদ্ধ। অনুগ্রহ করে আপনার আসল ইন্টারনেট কানেকশন দিয়ে চেষ্টা করুন।
                  </p>
                ) : (
                  <p className="text-slate-600 text-xs leading-relaxed">
                    নিরাপত্তা জনিত কারণে আপনার <span className="font-bold">ডিভাইস বা আইপি</span> অ্যাড্রেস থেকে মিটিংয়ে জয়েন করা সাময়িকভাবে বন্ধ আছে।
                  </p>
                )}
                
                <div className="bg-slate-200 px-3 py-2 rounded-lg font-mono text-[10.5px] font-bold text-slate-700 mt-2 space-y-1">
                   <p className="border-b border-slate-300 pb-1">IP: {ipAddress}</p>
                   <p className="pt-0.5 text-[9px] opacity-70">UID: {deviceId?.substring(deviceId.length - 8)}</p>
                </div>
              </div>
              
              <div className="bg-amber-500/5 p-4 rounded-xl border border-amber-500/10 text-xs text-slate-600 text-left leading-normal">
                যদি এটি কোনো ভুলবশত হয়ে থাকে তবে অনুগ্রহ করে আপনার ইউনিটি আর্নিং (<strong className="text-amber-600">Unity Earning</strong>) কাউন্সেলরের সাথে সরাসরি যোগাযোগ করুন।
              </div>
            </motion.div>
            
            <div className="text-center text-[10px] text-slate-400 font-mono py-2">
              SECURITY PROTECTED • HARDWARE-IP LOCK
            </div>
          </div>
        )}

        {/* STUDENT SIGN IN / MEETING JOIN FORM SCREEN */}
        {!isLoading && !isBlocked && (
          <div className="flex-1 overflow-y-auto pt-6 md:pt-14 pb-8 flex flex-col bg-white relative">
            
            {/* Thin Scrolling Notice Bar - Moved outside motion.div for stability */}
            {noticeActive && noticeText.trim() && (
              <div className="w-full bg-emerald-50 border-b-2 border-emerald-200 py-2 px-3 overflow-hidden flex items-center gap-2 select-none shrink-0 sticky top-0 z-40 shadow-sm">
                <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-2 py-1 rounded-md text-[9px] font-black shrink-0 uppercase tracking-widest leading-none shadow-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                  </span>
                  <Bell className="h-3 w-3 text-white shrink-0" />
                  <span>নোটিশ</span>
                </span>
                
                {/* Scrolling Text marquee - LEFT TO RIGHT (direction="right") */}
                <div className="flex-1 overflow-hidden flex items-center">
                  <Marquee 
                    scrollamount="4" 
                    direction="right"
                    className="text-[11px] font-extrabold text-emerald-900 font-sans"
                  >
                    {noticeText} &nbsp;&nbsp;&nbsp;&nbsp; ★ &nbsp;&nbsp;&nbsp;&nbsp; {noticeText}
                  </Marquee>
                </div>
              </div>
            )}

            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col justify-between space-y-6 px-5 mt-4"
            >
              {/* Banner with Deep Blue & Gold */}
              <div className="bg-[#0f172a] rounded-2xl p-5 text-center border-b-4 border-amber-500 shadow-sm space-y-1.5 shrink-0">
                <p className="text-[10px] font-bold text-amber-500 tracking-widest uppercase mb-1">
                  Unity Earning কাউন্সেলিং মিটিং
                </p>
                <h1 className="text-xl font-black text-white tracking-tight">
                  মিটিংয়ে অংশগ্রহণ ফরম
                </h1>

                {/* Dynamically display the scheduled date/time on top of the joining form */}
                {meetingDate && (
                  <div className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/25 text-amber-400 px-3 py-1 rounded-full text-[10px] font-black mt-1 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>সেশনের সময়: {formatMeetingDateTime(meetingDate, meetingTime)}</span>
                  </div>
                )}
              </div>

              {/* Warnings / System Information */}
              <div className="space-y-4">
                {errorMessage && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-800 font-semibold">{errorMessage}</p>
                  </div>
                )}

                {!meetingActive && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-900 leading-normal">
                      এই মিটিং সেশনটি বৰ্তমানে নিষ্ক্রিয় রাখা হয়েছে। আপনি আপনার নাম জমা দিয়ে রাখতে পারেন, তবে অ্যাডমিন এটি সক্রিয় করার আগে রিডাইরেক্ট হতে পারবেন না।
                    </p>
                  </div>
                )}

                {/* Form Elements with Redesigned Name Input */}
                <form onSubmit={handleJoin} className="space-y-6">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-black text-slate-800 uppercase tracking-wider">
                        আপনার সঠিক নাম টাইপ করুন
                      </label>
                      <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">পাবলিক ভেরিফাইড</span>
                    </div>
                    
                    <div className="relative group">
                      {/* Active Indicator Glow */}
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-amber-300 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-200"></div>
                      
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-amber-600">
                          <User className="h-5 w-5" />
                        </span>
                        <input
                          type="text"
                          required
                          placeholder="আপনার নাম এখানে লিখুন..."
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 text-base font-bold transition-all shadow-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[9.5px] text-slate-500 font-medium italic text-center">
                      * নাম ভুল হলে মিটিং থেকে বের করে দেয়া হতে পারে।
                    </p>
                  </div>

                  {/* Rules Container */}
                  <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-xl p-4.5 space-y-2.5 text-[#92400e]">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-[#92400e]">
                      <AlertCircle className="h-4.5 w-4.5 shrink-0 text-amber-500" />
                      <h2>⚠️ বিশেষ বিজ্ঞপ্তি – জয়েন করার আগে পড়ুন</h2>
                    </div>
                    <ul className="space-y-2 text-[11px] text-amber-900 list-none pl-0.5 leading-relaxed font-medium">
                      <li className="relative pl-3.5">
                        <span className="absolute left-0 text-amber-500 font-bold">•</span>
                        মিটিং শুরু হওয়া মাত্র একটি <strong className="text-amber-800">স্ক্রিনশট (Screenshot)</strong> নিয়ে কাউন্সেলরকে ইনবক্স করুন।
                      </li>
                      <li className="relative pl-3.5">
                        <span className="absolute left-0 text-amber-500 font-bold">•</span>
                        মিটিংয়ের প্রথম থেকে শেষ পর্যন্ত সম্পূর্ণ সময় উপস্থিত থাকা বাধ্যতামূলক।
                      </li>
                      <li className="relative pl-3.5">
                        <span className="absolute left-0 text-amber-500 font-bold">•</span>
                        মাঝখান থেকে বের হয়ে যান তবে পুনরায় প্রবেশের সুযোগ থাকবে না।
                      </li>
                      <li className="relative pl-3.5">
                        <span className="absolute left-0 text-amber-500 font-bold">•</span>
                        মিটিং চলাকালীন ফোনের কোনো প্রকার অন্য কলে কথা বলা যাবে না।
                      </li>
                    </ul>
                  </div>

                  {/* Submit Trigger */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !fullName.trim()}
                    className="w-full py-3 bg-[#0f172a] hover:bg-[#1e293b] text-amber-500 hover:text-amber-400 font-bold rounded-xl shadow-lg transition duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <>
                      {isSubmitting ? (
                        <div className="flex flex-col items-center gap-1.5 py-1">
                          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                          <span className="text-[10px] animate-pulse">লিঙ্ক যাচাই করা হচ্ছে এবং মিট অ্যাপ ওপেন করা হচ্ছে...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          <span>মিটিংয়ে প্রবেশ করুন</span>
                        </div>
                      )}
                    </>
                  </button>
                </form>
              </div>

              {/* Verified Badge */}
              {ipAddress && (
                <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-150 border-slate-100 flex items-center justify-between text-[10px] text-slate-500 select-none">
                  <span>নিরাপদ সংযোগ ভেরিফাইড</span>
                  <span>IP: <code className="text-amber-600 font-mono font-medium">{ipAddress === 'Unknown' ? 'যাচাই করা হচ্ছে...' : ipAddress}</code></span>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* HOME INDICATOR (Desktop Only) */}
        <div className="hidden md:block absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-400 rounded-full opacity-60"></div>

      </div>
    </div>
  );
}
