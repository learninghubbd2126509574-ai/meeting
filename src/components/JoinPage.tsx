import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { AlertCircle, User, Loader2, CheckCircle, ShieldAlert, Bell, Clock } from 'lucide-react';
import { motion } from 'motion/react';

const Marquee = 'marquee' as any;

interface JoinPageProps {
  meetingId: string;
}

export default function JoinPage({ meetingId }: JoinPageProps) {
  const [fullName, setFullName] = useState('');
  const [ipAddress, setIpAddress] = useState<string>('যাচাই হচ্ছে...');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isIpBlocked, setIsIpBlocked] = useState<boolean>(false);
  const [isDeviceBlocked, setIsDeviceBlocked] = useState<boolean>(false);
  const [isVPN, setIsVPN] = useState<boolean>(false);

  const isBlocked = isIpBlocked || isDeviceBlocked || isVPN;
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
  const [preventRepeatJoins, setPreventRepeatJoins] = useState<boolean>(true);
  const [publicLinkActive, setPublicLinkActive] = useState<boolean>(true);

  // Demo flow states
  const [demoModeActive, setDemoModeActive] = useState<boolean>(false);
  const [demoCode, setDemoCode] = useState<string>('1234');
  const [demoModeStep, setDemoModeStep] = useState<'enter_code' | 'enter_info' | null>(null);
  const [demoEnteredCode, setDemoEnteredCode] = useState<string>('');
  const [demoNameInput, setDemoNameInput] = useState<string>('');
  const [demoGmailInput, setDemoGmailInput] = useState<string>('');
  const [demoError, setDemoError] = useState<string | null>(null);
  const [isDemoSubmitting, setIsDemoSubmitting] = useState<boolean>(false);

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

        // B. Fetch IP (with robust fallbacks to ensure verification)
        let detectedIp = 'Unknown';
        const ipEndpoints = [
          'https://api.ipify.org?format=json',
          'https://api64.ipify.org?format=json',
          'https://ipapi.co/json/'
        ];

        for (const url of ipEndpoints) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              if (data.ip) {
                detectedIp = data.ip;
                break;
              }
            }
          } catch (e) {
            console.warn(`Fetch IP from ${url} failed:`, e);
          }
        }
        setIpAddress(detectedIp);

        // Security Check (Async)
        // Only run detailed metadata if a valid IP was successfully resolved
        if (detectedIp !== 'Unknown' && detectedIp !== 'যাচাই হচ্ছে...') {
          fetch(`https://ipapi.co/${detectedIp}/json/`)
            .then(res => res.json())
            .then(meta => {
              const org = (meta.org || '').toLowerCase();
              const asn = (meta.asn || '').toLowerCase();
              const hostingKeywords = ['amazon', 'google', 'digitalocean', 'ovh', 'linode', 'vultr', 'm247', 'pax8', 'hosting', 'datacenter', 'proxy', 'vpn', 'cloudflare'];
              if (hostingKeywords.some(kw => org.includes(kw) || asn.includes(kw))) {
                setIsVPN(true);
              }
            }).catch(() => {});
        }

        // C. Real-time Block Listeners (Active tracking)
        unsubBlockIP = onSnapshot(doc(db, 'blockedIPs', (detectedIp === 'Unknown' || detectedIp === 'যাচাই হচ্ছে...') ? 'temp' : detectedIp), (snap) => {
          setIsIpBlocked(snap.exists());
        });

        if (dId) {
          unsubBlockDevice = onSnapshot(doc(db, 'blockedDevices', dId), (snap) => {
            setIsDeviceBlocked(snap.exists());
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

        // E. Real-time Admin Settings Listener (Notice and Joint Policy)
        unsubSettings = onSnapshot(doc(db, 'adminSettings', 'settings'), (snap) => {
          if (snap.exists()) {
            const sData = snap.data();
            setNoticeText(sData.noticeText || '');
            setNoticeActive(sData.noticeActive === true);
            setPreventRepeatJoins(sData.preventRepeatJoins !== false);
            setPublicLinkActive(sData.publicLinkActive !== false);
            setDemoModeActive(sData.demoModeActive === true);
            setDemoCode(sData.demoCode || '1234');
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
    if (!ipAddress || ipAddress === 'যাচাই হচ্ছে...') {
      setErrorMessage("আপনার নিরাপত্তা ব্যবস্থা যাচাই করা হচ্ছে। অনুগ্রহ করে একটু অপেক্ষা করুন।");
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
            setIsIpBlocked(true);
            setIsSubmitting(false);
            return;
          }
        } catch (e) {
          console.warn("DB block check failed, continuing join flow", e);
        }
      }

      if (deviceId && deviceId !== 'Unknown') {
        try {
          const deviceSnap = await getDoc(doc(db, 'blockedDevices', deviceId));
          if (deviceSnap.exists()) {
            setIsDeviceBlocked(true);
            setIsSubmitting(false);
            return;
          }
        } catch (e) {
          console.warn("DB device block check failed, continuing join flow", e);
        }
      }

      // 2.5. Check for same IP duplicate prevention if enabled
      if (preventRepeatJoins && ipAddress && ipAddress !== 'Unknown') {
        try {
          const qSameIp = query(
            collection(db, 'participants'),
            where('meetingId', '==', meetingId),
            where('ip', '==', ipAddress)
          );
          const snapSameIp = await getDocs(qSameIp);
          
          // Check if someone with a different device id is already using this IP index
          const duplicate = snapSameIp.docs.find(docOpt => {
            const data = docOpt.data();
            return data.deviceId !== deviceId;
          });

          if (duplicate) {
            setErrorMessage("দুঃখিত, এই আইপি অ্যাড্রেস (IP Address) দিয়ে ইতিপূর্বে অন্য একটি ডিভাইস থেকে মিটিংয়ে জয়েন করা হয়েছে। একই ওয়াইফাই বা ইন্টারনেট সংযোগ দিয়ে দ্বিতীয় কেউ মিটিংয়ে অংশগ্রহণ করতে পারবেন না।");
            setIsSubmitting(false);
            return;
          }
        } catch (errSameIp) {
          console.warn("Failed to check duplicate IP joins:", errSameIp);
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

  // 2.2. Submit demo 4-digit code
  function handleDemoCodeVerify(e: React.FormEvent) {
    e.preventDefault();
    setDemoError(null);
    if (demoEnteredCode === demoCode) {
      setDemoModeStep('enter_info');
    } else {
      setDemoError("ভুল ডেমো কোড! অনুগ্রহ করে আপনার অ্যাডমিন কর্তৃক সেট করা কোডটি সঠিকভাবে দিন।");
    }
  }

  // 2.3. Submit demo user info and join
  async function handleDemoJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!demoNameInput.trim() || !demoGmailInput.trim()) {
      setDemoError("আপনার নাম এবং জিমেইল উভয় ফিল্ডই পূরণ করা আবশ্যক।");
      return;
    }

    if (!ipAddress || ipAddress === 'যাচাই হচ্ছে...') {
      setDemoError("নিরাপত্তা ব্যবস্থা যাচাই করা হচ্ছে। অনুগ্রহ করে একটু অপেক্ষা করুন।");
      return;
    }

    try {
      setIsDemoSubmitting(true);
      setDemoError(null);

      // 1. Direct block list checks
      if (isBlocked) {
        setIsDemoSubmitting(false);
        setDemoError("দুঃখিত, আইপি বা ডিভাইস ব্লক থাকার কারণে আপনি জয়েন করতে পারছেন না।");
        return;
      }

      if (ipAddress && ipAddress !== 'Unknown') {
        const blockSnap = await getDoc(doc(db, 'blockedIPs', ipAddress));
        if (blockSnap.exists()) {
          setIsIpBlocked(true);
          setIsDemoSubmitting(false);
          setDemoError("দুঃখিত, আপনার আইপিটি ব্লকড করা হয়েছে।");
          return;
        }
      }

      if (deviceId && deviceId !== 'Unknown') {
        const deviceSnap = await getDoc(doc(db, 'blockedDevices', deviceId));
        if (deviceSnap.exists()) {
          setIsDeviceBlocked(true);
          setIsDemoSubmitting(false);
          setDemoError("দুঃখিত, আপনার ডিভাইসটি ব্লকড করা হয়েছে।");
          return;
        }
      }

      // 2. Save to demoParticipants collection
      const demoPartId = `dm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const demoRef = doc(db, 'demoParticipants', demoPartId);

      const demoPayload = {
        name: demoNameInput.trim(),
        gmail: demoGmailInput.trim(),
        meetingId: meetingId,
        ip: ipAddress || 'Unknown',
        deviceId: deviceId || 'Unknown',
        userAgent: navigator.userAgent || 'Unknown Browser',
        joinedAt: serverTimestamp(),
        blocked: false
      };

      try {
        await setDoc(demoRef, demoPayload);
      } catch (err) {
        console.warn("Failed to write to demoParticipants, redirecting anyway", err);
      }

      // 3. Meet active checking
      if (!meetingActive) {
        setDemoError("এই কাউন্সেলিং সেশনটি বৰ্তমানে নিষ্ক্রিয় বা সম্পন্ন করা হয়েছে।");
        setIsDemoSubmitting(false);
        return;
      }

      if (!googleMeetLink) {
        setDemoError("গুগল মিট (Google Meet) লিংকটি এখনও সেশনে যুক্ত করা হয়নি।");
        setIsDemoSubmitting(false);
        return;
      }

      // 4. Redirect
      let redirectUrl = googleMeetLink.trim();
      if (!/^https?:\/\//i.test(redirectUrl)) {
        redirectUrl = 'https://' + redirectUrl;
      }

      window.location.assign(redirectUrl);

    } catch (err: any) {
      console.error("Demo registration error:", err);
      setDemoError("সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। আবার চেষ্টা করুন।");
      setIsDemoSubmitting(false);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col justify-center items-center p-0 md:p-8 select-text overflow-x-hidden relative">
      
      {/* Ambient glass glows for luxury background context on desktop */}
      <div className="hidden md:block absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[130px] pointer-events-none"></div>
      <div className="hidden md:block absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[130px] pointer-events-none"></div>
      
      {/* PHONE FRAME CHASSIS (Desktop Only) */}
      <div className="w-full min-h-screen md:min-h-[840px] md:max-w-[410px] md:h-[840px] md:border-[14px] md:border-slate-800 md:rounded-[56px] md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] bg-slate-50 flex flex-col relative overflow-hidden transition-all duration-300">
        
        {/* Inner shadow/ring border overlay to give real physical frame depth */}
        <div className="absolute inset-0 border border-slate-700/35 rounded-[42px] pointer-events-none z-50 hidden md:block"></div>

        {/* PHONE NOTCH / STATUS BAR (Desktop Only) */}
        <div className="hidden md:flex absolute top-0 inset-x-0 h-10 bg-slate-950 justify-between items-center px-7 z-50 text-[10.5px] text-slate-300 font-mono select-none">
          <span className="font-bold tracking-tight text-white/95">০৯:২১</span>
          
          {/* Pill shape dynamic island/notch */}
          <div className="w-28 h-5.5 bg-black rounded-full absolute left-1/2 -translate-x-1/2 flex items-center justify-center border border-slate-800/80 shadow-inner">
            <div className="w-3 h-3 bg-slate-900 rounded-full border border-slate-800 absolute left-3 flex items-center justify-center p-[1px]">
              <div className="w-1.5 h-1.5 bg-blue-950 rounded-full"></div>
            </div>
            <div className="w-10 h-1 bg-slate-900 rounded-full absolute right-4"></div>
          </div>
          
          <div className="flex items-center gap-1.5">
            <span className="font-black text-[9px] text-[#22c55e]">5G</span>
            {/* Wifi Icon */}
            <div className="flex gap-[1px] items-end h-2.5">
              <div className="w-[2.5px] h-1 bg-emerald-500 rounded-full"></div>
              <div className="w-[2.5px] h-1.5 bg-emerald-500 rounded-full"></div>
              <div className="w-[2.5px] h-2 bg-emerald-500 rounded-full"></div>
              <div className="w-[2.5px] h-2.5 bg-emerald-500 rounded-full"></div>
            </div>
            {/* Battery */}
            <div className="w-5 h-2.5 border border-slate-400 rounded-sm p-[1px] flex items-center relative gap-[1px]">
              <div className="bg-emerald-500 h-full w-[85%] rounded-[1px]"></div>
              <div className="w-[1.5px] h-1 bg-slate-400 rounded-r-sm absolute -right-[2px] top-1/2 -translate-y-1/2"></div>
            </div>
          </div>
        </div>

        {/* LOADING STATE - Centered inside mobile frame */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 space-y-4 pt-14 text-center">
            <div className="p-4 bg-white rounded-3xl shadow-md border border-slate-100 flex items-center justify-center">
              <Loader2 className="h-9 w-9 animate-spin text-amber-500" />
            </div>
            <div className="space-y-1">
              <p className="text-slate-800 font-black text-sm">ডিভাইস ভেরিফিকেশন চলছে</p>
              <p className="text-slate-400 font-medium text-[10px]">নিরাপত্তা ব্যবস্থা এবং আইপি অ্যাড্রেস সংযোগ পরীক্ষা হচ্ছে...</p>
            </div>
          </div>
        )}

        {/* BLOCKED ACCESS-DENIED SCREEN - Center inside frame */}
        {!isLoading && isBlocked && (
          <div className="flex-1 flex flex-col justify-between p-6 bg-slate-50 pt-16">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 text-center pt-8"
            >
              <div className="h-20 w-20 bg-rose-50 rounded-3xl shadow-inner flex items-center justify-center mx-auto border-2 border-rose-100">
                <ShieldAlert className="h-11 w-11 text-rose-500" />
              </div>
              
              <div className="space-y-3">
                <h1 className="text-2xl font-black text-rose-600 tracking-tight">অ্যাক্সেস ব্লকড!</h1>
                
                {isVPN ? (
                  <p className="text-slate-600 text-xs leading-relaxed px-2 font-medium">
                    নিরাপত্তা জনিত কারণে <span className="font-extrabold text-rose-650 underline decoration-rose-400">VPN বা প্রক্সি (Proxy Network)</span> ব্যবহার করে মিটিংয়ে জয়েন করা সম্পূর্ণরূপে নিষিদ্ধ। অনুগ্রহ করে আপনার আসল ওয়াইফাই বা মোবাইল ইন্টারনেট ব্যবহার করুন।
                  </p>
                ) : (
                  <p className="text-slate-600 text-xs leading-relaxed px-2 font-medium">
                    দুঃখিত, আমাদের সিকিউরিটি ফিল্টার আপনার <span className="font-extrabold text-rose-650">ডিভাইস আইপি অথবা হার্ডওয়্যার আইডি</span> ব্লক করেছে। আপনি আর এই মিটিং সেশনে প্রবেশ করতে পারবেন না।
                  </p>
                )}
                
                <div className="bg-slate-200/80 border border-slate-300/40 px-3 py-2 rounded-2xl font-mono text-[10.5px] font-extrabold text-slate-700 mt-3 space-y-1 shadow-sm text-left">
                   <p className="border-b border-slate-300 pb-1 flex justify-between"><span>IP ADDRESS:</span> <span className="text-rose-600">{ipAddress}</span></p>
                   <p className="pt-1 flex justify-between"><span>DEVICE ID:</span> <span className="text-slate-600">{deviceId ? `${deviceId.substring(0, 12)}...` : 'Unknown'}</span></p>
                </div>
              </div>
              
              <div className="bg-amber-500/10 p-4.5 rounded-2xl border border-amber-500/15 text-[11px] text-amber-900 font-medium text-left leading-normal">
                যদি আপনার মনে হয় এটি যান্ত্রিক ভুল অথবা অসাবধানতাবশত হয়ে থাকে, তবে আপনার ইউনিটি আর্নিং (<strong className="text-amber-800">Unity Earning</strong>) অ্যাডমিন বা সুপিরিয়র লিডারকে সরাসরি জানান।
              </div>
            </motion.div>
            
            <div className="text-center text-[9px] text-slate-400 font-mono py-2 font-semibold">
              SECURITY BLOCKER BY UNITY EARNING V2
            </div>
          </div>
        )}

        {/* PUBLIC LINK DISABLED / TIMER OFF SCREEN (FULL SYSTEM ERROR WEB GATE) */}
        {!isLoading && !isBlocked && !publicLinkActive && (
          <div className="flex-1 flex flex-col justify-between p-6 bg-slate-50 pt-16 font-sans">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 text-center pt-8"
            >
              <div className="h-20 w-20 bg-rose-50 rounded-3xl shadow-inner flex items-center justify-center mx-auto border-2 border-rose-200">
                <ShieldAlert className="h-11 w-11 text-rose-600 animate-bounce" />
              </div>
              
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 bg-rose-100 border border-rose-200 px-3 py-1 rounded-full text-[10px] font-black text-rose-850 shadow-sm uppercase tracking-wide">
                  <span>ERROR: 403_ACCESS_DISABLED</span>
                </div>
                
                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                  সিস্টেম লিংক নিষ্ক্রিয় করা হয়েছে!
                </h1>
                
                <p className="text-slate-600 text-[12px] leading-relaxed px-2 font-bold select-none">
                  দুঃখিত, এই ওয়েবসাইটের জয়েনিং লিঙ্ক সাময়িকভাবে বন্ধ বা অফ করে দেওয়া হয়েছে। সিস্টেম সুরক্ষার স্বার্থে বর্তমানে নতুন কোনো মেম্বার এই মিটিংয়ে যুক্ত হতে পারবেন না।
                </p>
              </div>

              <div className="bg-rose-50/70 border border-rose-150 rounded-2xl p-4.5 flex flex-col gap-1.5 text-left shadow-sm">
                <p className="text-[11.5px] text-rose-800 font-extrabold uppercase tracking-wider flex items-center gap-1.5 border-b border-rose-200/50 pb-1.5 mb-1">
                  <AlertCircle className="h-4.5 w-4.5 text-rose-600 animate-pulse" />
                  গুরুত্বপূর্ণ নির্দেশাবলী:
                </p>
                <p className="text-[12px] text-slate-700 leading-normal font-bold">
                  যদি আপনি সেশনে অংশগ্রহণ করতে ইচ্ছুক হন অথবা মনে করেন এটি অনাকাঙ্ক্ষিত কোনো যান্ত্রিক ত্রুটি, তবে এখনই আপনার ইউনিটি আর্নিং (<span className="text-red-700">Unity Earning</span>) কাউন্সেলর বা সুপিরিয়র লিডারের সাথে সরাসরি যোগাযোগ করুন।
                </p>
              </div>

              <div className="bg-slate-200/50 border border-slate-300/45 px-3.5 py-2.5 rounded-xl font-mono text-[10px] text-slate-500 font-bold space-y-0.5 text-left">
                <p className="flex justify-between"><span>LINK STATUS:</span> <span className="text-rose-600 font-black">OFFLINE</span></p>
                <p className="flex justify-between"><span>SECURITY LEVEL:</span> <span className="text-slate-700 font-black">STRICT_ACTIVE</span></p>
              </div>
            </motion.div>
            
            <div className="text-center text-[9px] text-slate-400 font-mono py-2 font-semibold select-none">
              SYSTEM BLOCKED BY UNITY EARNING V2
            </div>
          </div>
        )}

        {/* STUDENT SIGN IN / MEETING JOIN FORM SCREEN */}
        {!isLoading && !isBlocked && publicLinkActive && (
          <div className="flex-1 overflow-y-auto pt-6 md:pt-14 pb-8 flex flex-col bg-slate-50 relative animate-fade-in">
            
            {/* --- DEMO MODE OVERLAY / CARD MODAL --- */}
            {demoModeStep !== null && (
              <div 
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-5 font-sans"
              >
                <div 
                  className="w-full max-w-sm bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 relative overflow-hidden space-y-4 animate-scale-up"
                >
                  {/* Decorative colors Accent */}
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-500"></div>

                  {/* Close Button */}
                  <button 
                    type="button"
                    onClick={() => {
                      setDemoModeStep(null);
                      setDemoEnteredCode('');
                      setDemoNameInput('');
                      setDemoGmailInput('');
                      setDemoError(null);
                    }}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-650 font-bold bg-slate-100 h-6 w-6 rounded-full flex items-center justify-center text-xs cursor-pointer"
                  >
                    ✕
                  </button>

                  <div className="text-center space-y-1 pt-1">
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full text-[10px] font-black text-emerald-800 shadow-xs uppercase">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      ডেমো ইউজার পোর্টাল
                    </span>
                    <h3 className="text-lg font-black text-slate-900 leading-tight">ইউনিক ডেমো সাইন-ইন</h3>
                    <p className="text-[10px] text-slate-500 font-extrabold leading-relaxed">
                      অ্যাডমিন প্যানেল কর্তৃক নির্ধারিত কোড দিয়ে প্রবেশ করুন।
                    </p>
                  </div>

                  {demoError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 font-bold text-[10px] leading-relaxed text-center">
                      ⚠️ {demoError}
                    </div>
                  )}

                  {/* STEP 1: Enter Code */}
                  {demoModeStep === 'enter_code' && (
                    <form onSubmit={handleDemoCodeVerify} className="space-y-4">
                      <div className="space-y-1.5 text-center">
                        <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">৪ সংখ্যার কোড টাইপ করুন</label>
                        <input
                          type="text"
                          required
                          maxLength={4}
                          pattern="[0-9]{4}"
                          placeholder="••••"
                          value={demoEnteredCode}
                          onChange={(e) => setDemoEnteredCode(e.target.value.replace(/\D/g, ''))}
                          className="w-32 mx-auto text-center px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-mono font-black text-2xl tracking-[0.5em] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                        />
                        <p className="text-[9px] text-slate-400 font-semibold">অ্যাডমিন আইডি থেকে সেট করা ৪ সংখ্যার কোডটি দিন।</p>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-[0_4px_12px_rgba(16,185,129,0.25)] transition duration-155 text-[12px] cursor-pointer"
                      >
                        কোড ভেরিফাই করুন
                      </button>
                    </form>
                  )}

                  {/* STEP 2: Enter Student Name and Gmail */}
                  {demoModeStep === 'enter_info' && (
                    <form onSubmit={handleDemoJoin} className="space-y-4">
                      <div className="space-y-3">
                         <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-700 block uppercase">আপনার সম্পূর্ণ নাম</label>
                           <input
                             type="text"
                             required
                             placeholder="যেমন: মোঃ সাকিব হাসান"
                             value={demoNameInput}
                             onChange={(e) => setDemoNameInput(e.target.value)}
                             className="w-full px-4.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                           />
                         </div>

                         <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-700 block uppercase">জিমেইল অ্যাড্রেস</label>
                           <input
                             type="email"
                             required
                             placeholder="যেমন: sakib@gmail.com"
                             value={demoGmailInput}
                             onChange={(e) => setDemoGmailInput(e.target.value)}
                             className="w-full px-4.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                           />
                         </div>
                       </div>

                       <button
                         type="submit"
                         disabled={isDemoSubmitting}
                         className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-[0_4px_12px_rgba(16,185,129,0.25)] transition duration-155 text-[12px] cursor-pointer flex items-center justify-center gap-2"
                       >
                         {isDemoSubmitting ? (
                           <>
                             <Loader2 className="h-4 w-4 animate-spin text-white" />
                             <span>মিটিংয়ে রেফার করা হচ্ছে...</span>
                           </>
                         ) : (
                           <>
                             <CheckCircle className="h-4 w-4 text-white" />
                             <span>মিটিংয়ে প্রবেশ করুন (ডেমো)</span>
                           </>
                         )}
                       </button>
                    </form>
                  )}
                </div>
              </div>
            )}
            
            {/* Thin Scrolling Notice Bar */}
            {noticeActive && noticeText.trim() && (
              <div className="w-full bg-[#10b981] text-white py-2.5 px-3.5 overflow-hidden flex items-center gap-2 select-none shrink-0 sticky top-0 z-40 shadow-md">
                <span className="inline-flex items-center gap-1.5 bg-white text-emerald-800 px-2 py-0.5 rounded-md text-[9px] font-black shrink-0 tracking-wide uppercase leading-none shadow-sm">
                  <Bell className="h-3 w-3 text-[#10b981] shrink-0 font-bold" />
                  <span>ঘোষণা</span>
                </span>
                
                {/* Scrolling Text marquee - scrolling Right to Left natural read flow */}
                <div className="flex-1 overflow-hidden flex items-center">
                  <Marquee 
                    scrollamount="3" 
                    direction="left"
                    className="text-[10.5px] font-extrabold font-sans whitespace-nowrap text-white"
                  >
                    {noticeText} &nbsp;&nbsp;&nbsp;&nbsp; ★ &nbsp;&nbsp;&nbsp;&nbsp; {noticeText}
                  </Marquee>
                </div>
              </div>
            )}

            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col justify-between space-y-6 px-5 mt-4"
            >
              {/* Premium Luxury Header Banner (Redesigned) */}
              <div className="bg-white rounded-3xl p-6 border border-slate-150 shadow-[0_8px_30px_rgb(0,0,0,0.03)] space-y-4 shrink-0 relative overflow-hidden text-center">
                {/* Decorative Amber Elegant Accents */}
                <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500"></div>
                <div className="absolute -top-12 -right-12 w-28 h-28 bg-amber-500/[0.03] rounded-full blur-xl pointer-events-none"></div>
                <div className="absolute -bottom-12 -left-12 w-28 h-28 bg-indigo-500/[0.03] rounded-full blur-xl pointer-events-none"></div>

                <div className="space-y-2">
                  <div 
                    onClick={() => {
                      if (demoModeActive) {
                        setDemoModeStep('enter_code');
                        setDemoEnteredCode('');
                        setDemoNameInput('');
                        setDemoGmailInput('');
                        setDemoError(null);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-full text-[10px] font-extrabold text-amber-800 shadow-sm uppercase tracking-wide select-none ${
                      demoModeActive 
                        ? 'cursor-pointer hover:bg-amber-100 hover:border-amber-300 transition duration-150 active:scale-95 border-emerald-400 bg-emerald-50 text-emerald-800' 
                        : ''
                    }`}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${demoModeActive ? 'bg-emerald-400' : 'bg-rose-400'}`}>
                      </span>
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${demoModeActive ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    </span>
                    <span>সেশন লাইভ পোর্টাল</span>
                  </div>
                  
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 font-sans">
                    <span className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 bg-clip-text text-transparent">UNITY</span>
                    <span className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 bg-clip-text text-transparent ml-1.5">EARNING</span>
                  </h1>
                  <p className="text-[12px] font-bold text-slate-500 tracking-wide">
                    অফিসিয়াল সেশন জয়েনিং পোর্টাল
                  </p>
                </div>

                {meetingDate && (
                  <div className="inline-flex items-center gap-2 bg-amber-50 border-2 border-amber-200 text-amber-900 px-4.5 py-2.5 rounded-2xl text-[12.5px] font-black shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                    <span>সেশন সময়: <span className="text-amber-800 underline decoration-amber-300 font-bold">{formatMeetingDateTime(meetingDate, meetingTime)}</span></span>
                  </div>
                )}
              </div>

              {/* Warnings / System Information */}
              <div className="space-y-4">
                {errorMessage && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-start gap-2.5 shadow-sm">
                    <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-800 font-bold leading-normal">{errorMessage}</p>
                  </div>
                )}

                {!meetingActive && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 shadow-sm">
                    <AlertCircle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[10.5px] text-amber-900 leading-normal font-medium">
                      এই কাউন্সেলিং সেশনটি বৰ্তমানে অ্যাডমিন কর্তৃক নিষ্ক্রিয় রাখা হয়েছে। আপনি আপনার নাম সাবমিট করে রাখতে পারেন, কিন্তু মিটিং লিংক অন না করা পর্যন্ত রিডাইরেক্ট হতে পারবেন না।
                    </p>
                  </div>
                )}

                {/* Form Elements with Redesigned Name Input & Submission wrapper */}
                <form onSubmit={handleJoin} className="space-y-5">
                  <div className="bg-white rounded-3xl p-5 border border-slate-150 shadow-[0_10px_45px_rgb(0,0,0,0.03)] space-y-4">
                    <div className="flex items-center justify-between px-0.5">
                      <label className="block text-[11px] font-black text-slate-800 uppercase tracking-widest">
                        আপনার সঠিক নাম টাইপ করুন
                      </label>
                      <span className="text-[8.5px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider">ভেরিফাইড লিংক</span>
                    </div>
                    
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-amber-400 rounded-2xl blur opacity-10 group-focus-within:opacity-30 transition duration-300"></div>
                      
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-4.5 flex items-center text-amber-500">
                          <User className="h-5 w-5" />
                        </span>
                        <input
                          type="text"
                          required
                          placeholder="আপনার নাম এখানে লিখুন..."
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full pl-12.5 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-405 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 focus:bg-white text-[15px] font-bold transition-all shadow-inner"
                        />
                      </div>
                    </div>
                    
                    <div className="bg-rose-50/60 px-3 py-2 rounded-xl border border-rose-150/70 text-center">
                      <p className="text-[10px] text-rose-600 font-black">
                        ⚠️ নাম ভুল হলে মিটিং থেকে সরাসরি বের করে দেয়া হতে পারে।
                      </p>
                    </div>
                  </div>

                  {/* Rules Container (Redesigned with larger text and beautiful bullet badges) */}
                  <div className="bg-gradient-to-br from-[#fffdf5] to-[#fffcf3] border border-amber-200 rounded-3xl p-5.5 space-y-4 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/[0.02] rounded-full blur-xl pointer-events-none"></div>
                    
                    <div className="flex items-center gap-2 font-black text-sm text-[#92400e] border-b border-amber-200/60 pb-2.5">
                      <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
                      <h2>বিশেষ কাউন্সেলিং সেশন রুলস:</h2>
                    </div>
                    
                    <ul className="space-y-3.5 text-[12.5px] text-[#78350f] list-none pl-0.5 leading-relaxed font-bold">
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-black shadow-inner">১</span>
                        <span>মিটিংয়ে ঢুকেই প্রথম একটি <strong className="text-red-700 font-extrabold underline decoration-red-300">স্ক্রিনশট (Screenshot)</strong> নিয়ে কাউন্সেলরকে ইনবক্স করুন।</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-black shadow-inner">২</span>
                        <span>সেশনের সমস্ত নিয়মনীতি মেনে সম্পূর্ণ সময় মিটিংয়ে থাকা আবশ্যক।</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-black shadow-inner">৩</span>
                        <span>মাঝখানে চলে গেলে পুনরায় জয়েন রিকোয়েস্ট এক্সেপ্ট করা হবে না।</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-black shadow-inner">৪</span>
                        <span>মিটিং চলাকালীন ফোনের কোনো প্রকার কলে কথা বলা যাবে না।</span>
                      </li>
                    </ul>
                  </div>

                  {/* Redesigned Premium Submit Trigger */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !fullName.trim() || ipAddress === 'যাচাই হচ্ছে...'}
                    className="w-full py-4.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-600 hover:to-amber-500 text-slate-950 font-black rounded-2xl shadow-[0_10px_25px_-5px_rgba(245,158,11,0.4)] hover:shadow-[0_12px_30px_-5px_rgba(245,158,11,0.55)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 text-[14px] border border-amber-300/40 cursor-pointer text-center"
                  >
                    {ipAddress === 'যাচাই হচ্ছে...' ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-950" />
                        <span>নিরাপত্তা ভেরিফাই করা হচ্ছে...</span>
                      </div>
                    ) : isSubmitting ? (
                      <div className="flex flex-col items-center gap-1 py-0.5">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-950" />
                        <span className="text-[10px] font-bold animate-pulse">লিঙ্ক রিকোয়েস্ট হচ্ছে, অপেক্ষা করুন...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 px-1">
                        <CheckCircle className="h-5 w-5 text-slate-950" strokeWidth={2.5} />
                        <span>মিটিংয়ে প্রবেশ করুন</span>
                      </div>
                    )}
                  </button>
                </form>
              </div>

              {/* Verified Badge */}
              <div className="bg-white px-3.5 py-2.5 rounded-2xl border border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500 shadow-sm font-semibold select-none">
                <span>নিরাপদ সংযোগ কানেক্টেড</span>
                <span>IP: <code className="text-amber-600 font-mono font-bold">{ipAddress === 'Unknown' ? 'যাচাই করা অসম্ভব' : ipAddress}</code></span>
              </div>
            </motion.div>
          </div>
        )}

        {/* HOME INDICATOR (Desktop Only) */}
        <div className="hidden md:block absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-400/80 rounded-full opacity-70"></div>

      </div>
    </div>
  );
}
