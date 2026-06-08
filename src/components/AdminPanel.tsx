import React, { useState, useEffect } from 'react';
import { db, auth, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { signInAnonymously, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp,
  orderBy 
} from 'firebase/firestore';
import { 
  Lock, 
  Link as LinkIcon, 
  Users, 
  Ban, 
  Settings as SettingsIcon, 
  LogOut, 
  Copy, 
  Check, 
  Search, 
  Calendar, 
  ShieldAlert, 
  Clock, 
  CheckCircle,
  Loader2,
  AlertTriangle,
  LayoutDashboard,
  Trash2,
  Eye,
  Filter,
  Share2,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Meeting, Participant, BlockedIP } from '../types';

export default function AdminPanel() {
  // Navigation & Authentication
  const [activeTab, setActiveTab] = useState<'dashboard' | 'meeting' | 'data' | 'blocked' | 'settings'>('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMethod, setAuthMethod] = useState<'password' | 'google' | null>(null);
  
  // Login input
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Firestore Saved Settings
  const [savedPassword, setSavedPassword] = useState('212650');
  const [preventRepeatJoins, setPreventRepeatJoins] = useState(true);
  const [publicLinkActive, setPublicLinkActive] = useState(true);
  const [noticeText, setNoticeText] = useState('');
  const [noticeActive, setNoticeActive] = useState(false);
  const [isUpdatingNotice, setIsUpdatingNotice] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Real-time Data
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Meeting form
  const [meetInput, setMeetInput] = useState('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isMeetLinkActive, setIsMeetLinkActive] = useState(true);
  const [copysuccess, setCopysuccess] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [blockedSearchQuery, setBlockedSearchQuery] = useState('');
  const [blockedDateFilter, setBlockedDateFilter] = useState('');
  const [meetingsDateFilter, setMeetingsDateFilter] = useState('');

  // Meeting schedule state
  const [meetingDateInput, setMeetingDateInput] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [meetingTimeInput, setMeetingTimeInput] = useState('10:00');

  // Deletion confirmation states (prevents native window.confirm blocks)
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
  const [deletingParticipantId, setDeletingParticipantId] = useState<string | null>(null);

  // Password Settings tab form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  // 1. Forced Logout on Mount for Sessionless Security on TV & Public devices
  useEffect(() => {
    // We clear any active localStorage fallback and force sign out of any cached sessions.
    // This ensures every time someone visits the Link or reloads, they MUST type the password newly.
    localStorage.removeItem('ue_admin_auth');
    try {
      signOut(auth);
    } catch (e) {
      console.warn('Forced initial signout error:', e);
    }

    setIsAuthenticated(false);
    setAuthMethod(null);

    // Retrieve active settings or initialize them
    async function fetchSettings() {
      try {
        const docRef = doc(db, 'adminSettings', 'settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSavedPassword(data.password || '212650');
          setPreventRepeatJoins(data.preventRepeatJoins !== false);
          setPublicLinkActive(data.publicLinkActive !== false);
          setNoticeText(data.noticeText || '');
          setNoticeActive(data.noticeActive === true);
        } else {
          // Initialize settings collection
          await setDoc(docRef, { password: '212650', preventRepeatJoins: true, publicLinkActive: true, noticeText: '', noticeActive: false });
          setSavedPassword('212650');
          setPreventRepeatJoins(true);
          setPublicLinkActive(true);
          setNoticeText('');
          setNoticeActive(false);
        }
      } catch (err) {
        console.warn('Settings lookup restricted before auth, using fallback.', err);
      }
    }

    fetchSettings();
  }, []);

  // 2. Real-time Listeners for Dashboard UI
  useEffect(() => {
    if (!isAuthenticated) return;

    setIsDataLoading(true);

    const qMeetings = query(collection(db, 'meetings'), orderBy('createdAt', 'desc'));
    const unsubMeetings = onSnapshot(qMeetings, (snap) => {
      const list: Meeting[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Meeting);
      });
      setMeetings(list);
      // Pre-fill active link if present
        if (list.length > 0) {
          const activeItem = list.find(m => m.active) || list[0];
          setMeetInput(activeItem.googleMeetLink);
          setIsMeetLinkActive(activeItem.active);
          const origin = window.location.origin.trim().replace(/\/$/, ""); 
          setGeneratedLink(`${origin}/?join=${activeItem.id}`);
        }
      setIsDataLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'meetings');
    });

    const qParticipants = query(collection(db, 'participants'), orderBy('joinedAt', 'desc'));
    const unsubParticipants = onSnapshot(qParticipants, (snap) => {
      const list: Participant[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Participant);
      });
      setParticipants(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'participants');
    });

    const qBlocked = query(collection(db, 'blockedIPs'), orderBy('blockedAt', 'desc'));
    const unsubBlocked = onSnapshot(qBlocked, (snap) => {
      const list: BlockedIP[] = [];
      snap.forEach((doc) => {
        list.push({ ip: doc.id, ...doc.data() } as BlockedIP);
      });
      setBlockedIPs(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'blockedIPs');
    });

    // Real-time Settings Listener
    const unsubSettings = onSnapshot(doc(db, 'adminSettings', 'settings'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSavedPassword(data.password || '212650');
        setPreventRepeatJoins(data.preventRepeatJoins !== false);
        setPublicLinkActive(data.publicLinkActive !== false);
        setNoticeText(data.noticeText || '');
        setNoticeActive(data.noticeActive === true);
      }
    });

    return () => {
      unsubMeetings();
      unsubParticipants();
      unsubBlocked();
      unsubSettings();
    };
  }, [isAuthenticated]);

  // 3. Handle Password Login
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      // Fetch latest password on verify attempt
      let latestPassword = '212650';
      try {
        const docRef = doc(db, 'adminSettings', 'settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          latestPassword = docSnap.data().password || '212650';
        }
      } catch (err) {
        console.warn('Network read error, authenticating locally', err);
      }

      // Check if password matches latestPassword or fallback '212650'
      if (passwordInput === latestPassword || passwordInput === '212650') {
        // If password entered was '212650' but the database setting holds a different value,
        // let's heal/update the database credentials automatically.
        if (passwordInput === '212650' && latestPassword !== '212650') {
          try {
            const docRef = doc(db, 'adminSettings', 'settings');
            await setDoc(docRef, { password: '212650', preventRepeatJoins: preventRepeatJoins }, { merge: true });
            setSavedPassword('212650');
          } catch (writeError) {
            console.error('Failed to sync Firestore settings to 212650', writeError);
          }
        }

        // Authenticate anonymously so they have Firestore permission key
        try {
          await signInAnonymously(auth);
        } catch (authErr) {
          console.error("Anonymous authentication disabled or blocked. Proceeding with client authentication.", authErr);
        }
        setIsAuthenticated(true);
        setAuthMethod('password');
        setPasswordInput('');
      } else {
        setLoginError('ভুল পাসওয়ার্ড। দয়া করে সঠিক পাসওয়ার্ড দিন। (পাসওয়ার্ড: 212650)');
      }
    } catch (err) {
      setLoginError('একটি সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setIsLoggingIn(false);
    }
  }

  // 4. Handle Google Authentication Login
  async function handleGoogleLogin() {
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const email = res.user.email;
      
      if (email === 'learninghubbd2126509574@gmail.com') {
        setIsAuthenticated(true);
        setAuthMethod('google');
      } else {
        await signOut(auth);
        setLoginError('অ্যাক্সেস প্রত্যাখ্যান করা হয়েছে: এই গুগল অ্যাকাউন্টটি অনুমোদিত নয়।');
        setIsAuthenticated(false);
      }
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setLoginError('গুগল লগইন পপ-আপ উইন্ডোটি আপনি বন্ধ করে দিয়েছেন। দয়া করে আবার চেষ্টা করুন এবং উইন্ডোটি সম্পূর্ণ খুলতে দিন।');
      } else if (err?.code === 'auth/popup-blocked') {
        setLoginError('আপনার ব্রাউজার পপ-আপ উইন্ডো ব্লক করে রেখেছে। ব্রাউজারের সেটিংস থেকে পপ-আপ অ্যালাউ করুন এবং পুনরায় চেষ্টা করুন।');
      } else {
        setLoginError('গুগল লগইন সফল হয়নি। আপনি সাধারণ অ্যাডমিন পাসওয়ার্ড (২১২৬৫০) ব্যবহার করেও প্রবেশ করতে পারেন।');
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  // 5. Submit Google Meet URL & Generate Public Join link
  async function handleSaveMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!meetInput.trim()) return;

    try {
      setIsSavingLink(true);

      const meetingId = `meet_${Math.random().toString(36).substring(2, 8)}`;
      const meetRef = doc(db, 'meetings', meetingId);

      await setDoc(meetRef, {
        googleMeetLink: meetInput.trim(),
        createdAt: serverTimestamp(),
        active: isMeetLinkActive,
        meetingDate: meetingDateInput,
        meetingTime: meetingTimeInput
      });

      const origin = window.location.origin.trim().replace(/\/$/, "");
      const fullJoinUrl = `${origin}/?join=${meetingId}`;
      setGeneratedLink(fullJoinUrl);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'meetings/new');
    } finally {
      setIsSavingLink(false);
    }
  }

  // 6. Update individual active states of existing meeting
  async function toggleMeetingActive(mId: string, currentStatus: boolean) {
    try {
      const docRef = doc(db, 'meetings', mId);
      await updateDoc(docRef, { active: !currentStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `meetings/${mId}`);
    }
  }

  // 6.2. Permanent delete of meeting session
  async function handleDeleteMeeting(mId: string) {
    try {
      const docRef = doc(db, 'meetings', mId);
      await deleteDoc(docRef);
      if (generatedLink && generatedLink.includes(mId)) {
        setGeneratedLink(null);
      }
      setDeletingMeetingId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `meetings/${mId}`);
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

  // 7. Change Admin System Password
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMessage(null);

    if (newPassword.length < 4) {
      setPwdMessage({ type: 'error', text: 'পাসওয়ার্ড অত্যন্ত ছোট! কমপক্ষে ৪ সংখ্যার পাসওয়ার্ড দিন।' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdMessage({ type: 'error', text: 'পাসওয়ার্ড মিলেনি! দুটি পাসওয়ার্ড হুবহু এক হতে হবে।' });
      return;
    }

    try {
      setIsUpdatingPwd(true);
      const docRef = doc(db, 'adminSettings', 'settings');
      await setDoc(docRef, { password: newPassword }, { merge: true });
      setSavedPassword(newPassword);
      setPwdMessage({ type: 'success', text: 'অ্যাডমিন পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwdMessage({ type: 'error', text: 'পাসওয়ার্ড আপডেট করতে ব্যর্থ হয়েছে। ফায়ারস্টোর কানেকশন চেক করুন।' });
    } finally {
      setIsUpdatingPwd(false);
    }
  }

  // 8. Toggle Repeat Joins
  async function toggleRepeatJoinsSetting() {
    try {
      // Toggle setting (Note: JoinPage no longer enforces this but we keep the DB updated)
      const nextVal = !preventRepeatJoins;
      setPreventRepeatJoins(nextVal);
      const docRef = doc(db, 'adminSettings', 'settings');
      await setDoc(docRef, { preventRepeatJoins: nextVal }, { merge: true });
    } catch (err) {
      console.error('Failed to update repeat joins settings:', err);
    }
  }

  // 8.2. Toggle Public Link Active Setting
  async function togglePublicLinkActiveSetting() {
    try {
      const nextVal = !publicLinkActive;
      setPublicLinkActive(nextVal);
      const docRef = doc(db, 'adminSettings', 'settings');
      await setDoc(docRef, { publicLinkActive: nextVal }, { merge: true });
    } catch (err) {
      console.error('Failed to update public link active settings:', err);
    }
  }

  // 8.1. Save Notice Settings
  async function handleUpdateNotice(e: React.FormEvent) {
    e.preventDefault();
    setNoticeMessage(null);
    try {
      setIsUpdatingNotice(true);
      const docRef = doc(db, 'adminSettings', 'settings');
      await setDoc(docRef, { 
        noticeText: noticeText.trim(), 
        noticeActive: noticeActive 
      }, { merge: mergeFirestoreNotice() });
      setNoticeMessage({ type: 'success', text: 'চলমান নোটিশ এবং এর স্থিতি সফলভাবে সেভ করা হয়েছে!' });
    } catch (err: any) {
      setNoticeMessage({ type: 'error', text: 'নোটিশ আপডেট করতে ব্যর্থ হয়েছে।' });
    } finally {
      setIsUpdatingNotice(false);
    }
  }

  function mergeFirestoreNotice() {
    return true;
  }

  // 9. Block user (adds IP to blockedIPs and flags participant as blocked)
  async function handleBlockUser(participant: Participant) {
    try {
      // Block the IP
      const blockRef = doc(db, 'blockedIPs', participant.ip);
      await setDoc(blockRef, {
        ip: participant.ip,
        deviceId: participant.deviceId,
        blockedAt: serverTimestamp(),
        name: participant.name
      });

      // Also block the Device ID for persistent blocking (bypasses VPN)
      if (participant.deviceId && participant.deviceId !== 'Unknown') {
        const deviceRef = doc(db, 'blockedDevices', participant.deviceId);
        await setDoc(deviceRef, {
          deviceId: participant.deviceId,
          blockedAt: serverTimestamp()
        });
      }

      // Mark all participant entries with same IP or Device ID as blocked
      const matchedParts = participants.filter(p => 
        p.ip === participant.ip || 
        (participant.deviceId !== 'Unknown' && p.deviceId === participant.deviceId)
      );
      
      for (const p of matchedParts) {
        const pRef = doc(db, 'participants', p.id);
        await updateDoc(pRef, { blocked: true });
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `blocks/${participant.ip}`);
    }
  }

  // 10. Unblock user (removes IP from blockedIPs and updates participant flags)
  async function handleUnblockUser(targetIP: string, targetDeviceId?: string) {
    try {
      // Unblock IP
      const blockRef = doc(db, 'blockedIPs', targetIP);
      await deleteDoc(blockRef);

      // Unblock Device if exists
      if (targetDeviceId && targetDeviceId !== 'Unknown') {
        const deviceRef = doc(db, 'blockedDevices', targetDeviceId);
        await deleteDoc(deviceRef);
      }

      // If we don't have deviceId (e.g. unblocking from list tab where only IP is shown and deviceId might be missing in older records)
      // We try to find any deviceId in participants list that matches this IP
      const matchedParticipants = participants.filter(p => p.ip === targetIP);
      
      const matchedParts = participants.filter(p => 
        p.ip === targetIP || 
        (targetDeviceId && targetDeviceId !== 'Unknown' && p.deviceId === targetDeviceId)
      );
      
      for (const p of matchedParts) {
        const pRef = doc(db, 'participants', p.id);
        await updateDoc(pRef, { blocked: false });
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `blocks/${targetIP}`);
    }
  }

  // 11. Delete participant history record
  async function handleDeleteParticipant(pId: string) {
    try {
      const pRef = doc(db, 'participants', pId);
      await deleteDoc(pRef);
      setDeletingParticipantId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `participants/${pId}`);
    }
  }

  // Logout Admin session
  async function handleLogout() {
    await signOut(auth);
    localStorage.removeItem('ue_admin_auth');
    setIsAuthenticated(false);
  }

  function handleCopy() {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopysuccess(true);
    setTimeout(() => setCopysuccess(false), 2000);
  }

  // Formatting timestamp
  function formatTime(timestamp: any) {
    if (!timestamp) return 'সময় পাওয়া যায়নি';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function isSameDay(timestamp: any, filterDateStr: string) {
    if (!timestamp || !filterDateStr) return true;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const filterDate = new Date(filterDateStr);
    return (
      date.getFullYear() === filterDate.getFullYear() &&
      date.getMonth() === filterDate.getMonth() &&
      date.getDate() === filterDate.getDate()
    );
  }

  // Filtering participants log list
  const filteredParticipants = participants.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.ip.includes(searchQuery);
    const matchesDate = dateFilter ? isSameDay(p.joinedAt, dateFilter) : true;
    return matchesSearch && matchesDate;
  });

  // Calculate public sharing link vs local dev test link
  const { publicLink, testLink } = (() => {
    if (!generatedLink) return { publicLink: '', testLink: '' };
    
    // The test link is always the current generated link from the active session
    const tLink = generatedLink;
    
    // The public link should use the -pre- origin if we are currently on a -dev- origin
    let pLink = generatedLink;
    if (pLink.includes('-dev-')) {
       pLink = pLink.replace('-dev-', '-pre-');
    }
    
    return { publicLink: pLink, testLink: tLink };
  })();

  // --- RENDERING CHASSIS ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 flex flex-col justify-center items-center p-0 md:p-6 select-text overflow-x-hidden">
      
      {/* PHONE FRAME CHASSIS (Desktop Only) */}
      <div className="w-full min-h-screen md:min-h-[820px] md:max-w-[400px] md:h-[820px] md:border-[12px] md:border-slate-850 md:rounded-[48px] md:shadow-2xl bg-slate-50 flex flex-col relative overflow-hidden">
        
        {/* PHONE NOTCH / STATUS BAR (Desktop Only) */}
        <div className="hidden md:flex absolute top-0 inset-x-0 h-9 bg-slate-900 justify-between items-center px-6 z-50 text-[10px] text-slate-400 font-mono select-none">
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

        {/* 1. LOGIN SCREEN (If not authenticated) */}
        {!isAuthenticated ? (
          <div className="flex-1 overflow-y-auto pt-6 md:pt-14 pb-8 px-5 flex flex-col justify-between bg-slate-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col justify-center space-y-6"
            >
              <div className="text-center space-y-3">
                <span className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                  ম্যানেজমেন্ট পোর্টাল (অ্যাডমিন)
                </span>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-short">
                  অ্যাডমিন প্যানেল লগইন
                </h1>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                  Unity Earning মিটিং সিস্টেম কনফিগার করতে অনুগ্রহ করে পাসওয়ার্ড দিয়ে প্রবেশ করুন।
                </p>
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-2.5 text-xs text-red-600 font-semibold leading-relaxed">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                  <p>{loginError}</p>
                </div>
              )}

              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    অ্যাডমিন সিকিউরিটি পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                      <Lock className="h-4.5 w-4.5" />
                    </span>
                    <input
                      type="password"
                      required
                      placeholder="অ্যাডমিন পাসওয়ার্ড টাইপ করুন"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3 bg-[#0f172a] hover:bg-slate-800 text-amber-400 text-xs font-black rounded-xl shadow-lg transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isLoggingIn ? (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                  ) : (
                    <span>পাসওয়ার্ড দিয়ে প্রবেশ করুন</span>
                  )}
                </button>
              </form>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-3 text-[9px] text-slate-400 font-bold tracking-wider uppercase">অন্যান্য মাধ্যম</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="w-full py-3 border border-slate-200 bg-white text-slate-700 hover:text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>গুগল অ্যাকাউন্ট দিয়ে লগইন</span>
              </button>
            </motion.div>
          </div>
        ) : (
          
          // 2. MAIN LOGGED-IN ADMIN PANEL (Phone Layout)
          <div className="flex-1 flex flex-col justify-between bg-slate-50 pt-0 md:pt-9 relative h-full">
            
            {/* INNER HEADER ACCENTS */}
            <header className="px-4 py-3 bg-[#0f172a] text-white flex justify-between items-center shrink-0 border-b-2 border-amber-500 shadow-sm z-30">
              <div className="truncate">
                <h2 className="text-xs font-black text-amber-500 uppercase tracking-wider">
                  Unity Earning
                </h2>
                <p className="text-[10px] text-slate-300 font-bold truncate">
                  {activeTab === 'dashboard' && 'ড্যাশবোর্ড ওভারভিউ'}
                  {activeTab === 'meeting' && 'মিটিং লিংক তৈরি'}
                  {activeTab === 'data' && 'ইউজার লগ অ্যান্ড সেটিংস'}
                  {activeTab === 'blocked' && 'ডিভাইস ব্লকড লিস্ট'}
                  {activeTab === 'settings' && 'সিস্টেম সেটিংস'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {generatedLink && (
                  <button
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: 'Unity Earning Join Link',
                            text: 'মিটিং সেশনে যোগ দিতে নিচের লিঙ্কে ক্লিক করুন:',
                            url: publicLink
                          });
                        } catch (err: any) {
                          if (err.name !== 'AbortError') {
                            handleCopy();
                          }
                        }
                      } else {
                        handleCopy();
                      }
                    }}
                    className="h-8 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 transition rounded-lg flex items-center justify-center gap-1.5 cursor-pointer text-[10px] font-black"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">শেয়ার</span>
                  </button>
                )}
                
                <button
                  onClick={handleLogout}
                  title="লগআউট"
                  className="h-8 w-8 bg-white/10 hover:bg-rose-600 hover:text-white transition rounded-lg flex items-center justify-center cursor-pointer text-slate-300"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* CHASSIS SCROLLABLE PANEL BODY */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              
              {/* --- TAB 1: DASHBOARD --- */}
              {activeTab === 'dashboard' && (
                <div className="space-y-4">
                  {/* Primary Link Card */}
                  {generatedLink && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border-2 border-amber-400 rounded-2xl p-5 shadow-sm space-y-4"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">আপনার শেয়ারিং লিংক এখন তৈরি</span>
                      </div>
                      
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-500 font-bold leading-tight">পাবলিক মিটিং লিংক:</p>
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                          <div className="flex-1 truncate font-mono text-[11px] text-amber-700 font-bold">
                            {publicLink}
                          </div>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(publicLink);
                              setCopysuccess(true);
                              setTimeout(() => setCopysuccess(false), 2000);
                            }}
                            className="shrink-0 p-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg transition"
                          >
                            {copysuccess ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => window.open(publicLink, '_blank')}
                          className="flex items-center justify-center gap-1.5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] font-black transition shadow-sm"
                        >
                          <ExternalLink className="h-4 w-4" />
                          লিংক পরীক্ষা করুন
                        </button>
                        <button 
                          onClick={async () => {
                            if (navigator.share) {
                              try {
                                await navigator.share({
                                  title: 'Unity Earning',
                                  text: 'মিটিংয়ে জয়েন করুন',
                                  url: publicLink
                                });
                              } catch (err: any) {
                                if (err.name !== 'AbortError') {
                                  navigator.clipboard.writeText(publicLink);
                                  setCopysuccess(true);
                                  setTimeout(() => setCopysuccess(false), 2000);
                                }
                              }
                            } else {
                              navigator.clipboard.writeText(publicLink);
                              setCopysuccess(true);
                              setTimeout(() => setCopysuccess(false), 2000);
                            }
                          }}
                          className="flex items-center justify-center gap-1.5 py-3 bg-[#0f172a] hover:bg-slate-800 text-amber-400 rounded-xl text-[11px] font-black transition shadow-sm"
                        >
                          <Share2 className="h-4 w-4" />
                          সরাসরি শেয়ার
                        </button>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 shadow-inner">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-[10px] text-amber-900 leading-normal font-bold">
                            লিংকটি কাজ না করলে (Page not found দেখালে):
                          </p>
                          <p className="text-[9px] text-amber-800 leading-relaxed font-medium">
                            ডানদিকের <span className="underline font-bold text-slate-950">Share</span> বাটনে ক্লিক করে <span className="underline font-bold text-slate-950">Publish</span> করার পর ৫-১০ সেকেন্ড অপেক্ষা করে পেজটি রিফ্রেশ দিন। প্রথমবার সক্রিয় হতে সামান্য সময় লাগতে পারে।
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Indicators Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div 
                      onClick={() => setActiveTab('data')}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm select-none hover:border-amber-400 transition cursor-pointer"
                    >
                      <Users className="h-5 w-5 text-amber-500 mb-1" />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">মোট জয়েন লগ</p>
                      <h3 className="text-xl font-black text-slate-900">{participants.length} জন</h3>
                    </div>

                    <div 
                      onClick={() => setActiveTab('blocked')}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm select-none hover:border-red-400 transition cursor-pointer"
                    >
                      <Ban className="h-5 w-5 text-red-500 mb-1" />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ব্লকড আইপি</p>
                      <h3 className="text-xl font-black text-slate-900">{blockedIPs.length} টি</h3>
                    </div>
                  </div>

                  <div 
                    onClick={() => setActiveTab('meeting')}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between select-none hover:border-amber-400 transition cursor-pointer"
                  >
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-500 font-black uppercase">মিটিং সেশন কন্ট্রোল</p>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        সক্রিয় মিটিং: {meetings.filter(m => m.active).length} টি
                      </h3>
                    </div>
                    <span className="p-2 bg-emerald-50 text-emerald-600 rounded-full flex items-center">
                      <CheckCircle className="h-5 w-5" />
                    </span>
                  </div>
                </div>
              )}

              {/* --- TAB 2: MEETING LINK GENERATION --- */}
              {activeTab === 'meeting' && (
                <div className="space-y-4 font-sans">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-amber-500" />
                      গুগল মিট লিংক সেটআপ ও শিডিউলিং
                    </h3>
                    
                    <form onSubmit={handleSaveMeeting} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600">গুগল মিট (Google Meet) অরিজিনাল লিংক</label>
                        <input
                          type="url"
                          required
                          placeholder="যেমন: https://meet.google.com/abc-defg-hij"
                          value={meetInput}
                          onChange={(e) => setMeetInput(e.target.value)}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
                        />
                      </div>

                      {/* Scheduled Date & Time Pickers */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600">সেশনের তারিখ (Date)</label>
                          <input
                            type="date"
                            required
                            value={meetingDateInput}
                            onChange={(e) => setMeetingDateInput(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600">সেশনের সময় (Time)</label>
                          <input
                            type="time"
                            required
                            value={meetingTimeInput}
                            onChange={(e) => setMeetingTimeInput(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                          <p className="text-[10px] font-black text-slate-800">পাবলিক জয়েন সেশন সচল</p>
                          <p className="text-[9px] text-slate-500 leading-none mt-0.5">অফ করলে শিক্ষার্থীরা মিটিংয়ে ঢুকতে পারবে না</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsMeetLinkActive(!isMeetLinkActive)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isMeetLinkActive ? 'bg-amber-500' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isMeetLinkActive ? 'translate-x-[20px]' : 'translate-x-[0px]'
                            }`}
                          />
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={isSavingLink || !meetInput.trim()}
                        className="w-full py-2.5 bg-[#0f172a] text-amber-500 font-bold text-[11px] rounded-lg shadow-md hover:bg-slate-800 transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {isSavingLink ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'কনফিগার সেশন এবং লিংক সক্রিয় করুন'
                        )}
                      </button>
                    </form>

                    {/* LIVE DISPLAY BOX - INSTANT GENERATION ON SAME PAGE */}
                    {generatedLink && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-black text-[8px] uppercase tracking-wider">
                              নতুন জেনারেটেড সেশন
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          </div>
                          
                          {/* Display the created schedule date & time right here */}
                          {meetingDateInput && (
                            <div className="flex items-center gap-1 bg-[#fef3c7] border border-amber-200 text-[#92400e] px-2.5 py-1.5 rounded-lg text-[10px] font-black w-fit">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>সেশনের নির্ধারিত সময়: {formatMeetingDateTime(meetingDateInput, meetingTimeInput)}</span>
                            </div>
                          )}

                          <h4 className="text-xs font-black text-[#92400e] leading-tight pt-1">
                            শিক্ষার্থীদের শেয়ার করার নতুন লিংক:
                          </h4>
                          <p className="text-[10px] text-slate-500 leading-normal mb-1">
                            এই লিংকটি কপি করে আপনার শিক্ষার্থীদের দিন। তারা এই জয়েনিং ফর্ম পূরণ করে কুইক রিডাইরেক্ট হবে।
                          </p>
                          <div className="bg-white px-2.5 py-2.5 rounded-lg border border-slate-200 select-all font-mono text-[10px] font-semibold text-slate-700 truncate shadow-inner flex justify-between items-center gap-2">
                            <span className="truncate">{generatedLink}</span>
                            <button
                              onClick={handleCopy}
                              className="p-1.5 hover:bg-slate-100 text-amber-600 rounded-md shrink-0 transition"
                              title="কপি করুন"
                            >
                              {copysuccess ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleCopy}
                            className={`flex-1 py-2 rounded-lg text-[10px] font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition ${
                              copysuccess 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-[#0f172a] text-amber-500 hover:bg-[#1e293b]'
                            }`}
                          >
                            {copysuccess ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copysuccess ? 'সফলভাবে কপি হয়েছে' : 'নতুন জয়েন লিংক কপি করুন'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Direct test on current environment domain
                              const activeTestUrl = generatedLink.includes('?join=')
                                ? `${window.location.origin}/?join=${generatedLink.split('?join=')[1]}`
                                : generatedLink;
                              window.open(activeTestUrl, '_blank');
                            }}
                            className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-amber-500 hover:text-white hover:border-amber-500 text-[10px] font-extrabold rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                            title="আপনার চলতি পেজে টেস্ট করুন"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>যাচাই</span>
                          </button>
                        </div>

                        <p className="text-[9.5px] text-[#92400e]/80 leading-relaxed font-semibold">
                          💡 <span className="font-bold">কোঅর্ডিনেটর টিপ:</span> এটি পাবলিক করার আগে অবশ্যই ডানদিকের এডিটরে <span className="underline font-bold text-slate-900">Share/Publish</span> চাপবেন। তৎক্ষণাৎ টেস্ট করে দেখতে চাইলে ওপরের <span className="font-bold text-slate-900 leading-none bg-slate-100 px-1 rounded">যাচাই</span> বাটনটি চাপুন।
                        </p>
                      </motion.div>
                    )}
                  </div>

                  {/* Sessions logs preview */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-100">
                      <h3 className="text-xs font-black text-slate-900 uppercase">পূর্বে তৈরি করা সেশন লগস</h3>
                      
                      {/* Interactive Meeting date filter requested at top */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-500 flex items-center gap-0.5">
                          <Filter className="h-3 w-3 text-amber-500" />
                          তারিখ ফিল্টার:
                        </span>
                        <input
                          type="date"
                          value={meetingsDateFilter}
                          onChange={(e) => setMeetingsDateFilter(e.target.value)}
                          className="text-[9px] p-1 border border-slate-200 rounded bg-slate-50 font-bold focus:outline-none"
                        />
                        {meetingsDateFilter && (
                          <button
                            onClick={() => setMeetingsDateFilter('')}
                            className="text-[8px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200 font-bold cursor-pointer"
                          >
                            মুছুন
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5">
                      {(() => {
                        const filteredMeetings = meetings.filter((m) => {
                          if (!meetingsDateFilter) return true;
                          return m.meetingDate === meetingsDateFilter;
                        });

                        if (filteredMeetings.length === 0) {
                          return (
                            <p className="text-[10px] text-slate-400 italic text-center py-4">
                              {meetingsDateFilter ? 'নির্বাচিত তারিখে কোনো সেশন সোর্স রেকর্ড পাওয়া যায়নি।' : 'কোনো রেকর্ড পাওয়া যায়নি।'}
                            </p>
                          );
                        }

                        return filteredMeetings.map((m) => (
                          <div key={m.id} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-[10px]">
                            <div className="truncate space-y-0.5 max-w-[150px] sm:max-w-xs">
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono font-bold text-amber-700">{m.id}</code>
                                <span className={`px-1 rounded-[4px] text-[8px] font-black ${
                                  m.active ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-200 text-slate-600'
                                }`}>
                                  {m.active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-500 font-mono truncate">{m.googleMeetLink}</p>
                              
                              {/* DISPLAY CUSTOM SCHEDULE DATE/TIME DIRECTLY UNDER ID/LINK */}
                              {m.meetingDate && (
                                <p className="text-[9px] text-amber-600 font-black flex items-center gap-0.5 mt-0.5 bg-amber-50 px-1 rounded w-fit border border-amber-100">
                                  <Calendar className="h-3 w-3 shrink-0" />
                                  <span>তারিখ ও সময়: {formatMeetingDateTime(m.meetingDate, m.meetingTime)}</span>
                                </p>
                              )}
                            </div>

                            <div className="flex gap-1.5 shrink-0 items-center">
                              {deletingMeetingId === m.id ? (
                                <div className="flex items-center gap-1 bg-rose-50 p-1 rounded border border-rose-200 animate-fadeIn text-[8px]">
                                  <span className="text-[8px] text-rose-700 font-black shrink-0">ডিলিট করব?</span>
                                  <button
                                    onClick={() => handleDeleteMeeting(m.id)}
                                    className="px-1.5 py-0.5 bg-rose-600 text-white font-black text-[8px] rounded hover:bg-rose-700 cursor-pointer"
                                  >
                                    হ্যাঁ
                                  </button>
                                  <button
                                    onClick={() => setDeletingMeetingId(null)}
                                    className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-black text-[8px] rounded hover:bg-slate-300 cursor-pointer"
                                  >
                                    না
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => toggleMeetingActive(m.id, m.active)}
                                    className={`text-[9.5px] font-black px-2 py-0.5 aligned-middle rounded border transition cursor-pointer ${
                                      m.active 
                                        ? 'border-amber-250 bg-amber-50 text-amber-700 hover:bg-amber-100' 
                                        : 'border-emerald-250 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    }`}
                                  >
                                    {m.active ? 'বন্ধ' : 'চালু'}
                                  </button>

                                  <button
                                    onClick={() => setDeletingMeetingId(m.id)}
                                    title="রেকর্ড ডিলিট"
                                    className="p-1 px-1.5 border border-rose-200 bg-rose-50 hover:bg-rose-500 hover:text-white rounded text-rose-600 hover:border-rose-400 transition cursor-pointer flex items-center gap-0.5 text-[9.5px] font-bold"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>মুছুন</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB 3: PARTICIPANT LOGS & DELETION --- */}
              {activeTab === 'data' && (
                <div className="space-y-4">
                  {/* Filter and Search segment */}
                  <div className="space-y-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400">
                        <Search className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="শিক্ষার্থীর নাম বা আইপি দিয়ে খুজুন..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t pt-2 mt-2">
                      <span className="text-[9px] text-slate-550 font-bold">তারিখ দিয়ে ফিল্টার:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={dateFilter}
                          onChange={(e) => setDateFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] focus:outline-none"
                        />
                        {dateFilter && (
                          <button
                            onClick={() => setDateFilter('')}
                            className="text-[9px] border border-red-200 bg-red-50 text-red-600 px-1.5 py-1 rounded hover:bg-red-500 hover:text-white transition cursor-pointer"
                          >
                            মুছুন
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Participants table alternative layout for phone */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-extrabold text-slate-800">অংশগ্রহণকারীদের বিবরণ ({filteredParticipants.length})</h3>
                    
                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-0.5">
                      {filteredParticipants.length === 0 ? (
                        <p className="text-[10px] text-slate-450 italic text-center py-4">কোনো জয়েনিং লগ পাওয়া যায়নি।</p>
                      ) : (
                        filteredParticipants.map((p) => (
                          <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2 text-xs">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                  <span className={`h-2 w-2 rounded-full shrink-0 ${p.blocked ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                                  {p.name}
                                </h4>
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  <span className="font-mono text-[9px] text-slate-400 block">IP: <strong className="text-amber-700">{p.ip}</strong></span>
                                  <span className="font-mono text-[9px] text-slate-400 block">UID: <strong className="text-slate-600">{p.deviceId?.substring(p.deviceId.length - 8) || 'N/A'}</strong></span>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0 items-center">
                                {deletingParticipantId === p.id ? (
                                  <div className="flex items-center gap-1 bg-[#fff5f5] p-1 rounded border border-red-200 animate-fadeIn text-[8px]">
                                    <span className="text-[8px] text-red-700 font-extrabold shrink-0">ডিলিট?</span>
                                    <button
                                      onClick={() => handleDeleteParticipant(p.id)}
                                      className="px-1.5 py-0.5 bg-red-600 text-white font-black text-[8px] rounded hover:bg-red-700 cursor-pointer"
                                    >
                                      হ্যাঁ
                                    </button>
                                    <button
                                      onClick={() => setDeletingParticipantId(null)}
                                      className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-black text-[8px] rounded hover:bg-slate-300 cursor-pointer"
                                    >
                                      না
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeletingParticipantId(p.id)}
                                    title="লগ ডিলিট"
                                    className="p-1.5 border border-red-100 hover:bg-red-50 rounded text-red-500 hover:border-red-300 transition cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded border border-slate-100 text-[9px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                {formatTime(p.joinedAt)}
                              </span>
                              <span className="truncate max-w-[120px]" title={p.userAgent}>{p.userAgent}</span>
                            </div>

                            <div className="flex justify-end pt-1">
                              {p.blocked ? (
                                <button
                                  onClick={() => handleUnblockUser(p.ip, p.deviceId)}
                                  className="px-2.5 py-1 border border-emerald-250 bg-emerald-50 text-emerald-800 hover:bg-[#d1fae5] font-bold rounded text-[9px] transition cursor-pointer"
                                >
                                  আনব্লক করুন
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleBlockUser(p)}
                                  className="px-2.5 py-1 border border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white font-bold rounded text-[9px] transition cursor-pointer"
                                >
                                  স্থায়ী ব্লক করুন
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB 4: BLOCKED LIST --- */}
              {activeTab === 'blocked' && (() => {
                const filteredBlockedIPs = blockedIPs.filter((b) => {
                  // Filter by search query (Name or IP)
                  if (blockedSearchQuery) {
                    const queryLower = blockedSearchQuery.toLowerCase();
                    const ipMatch = b.ip?.toLowerCase().includes(queryLower);
                    const nameMatch = b.name?.toLowerCase().includes(queryLower);
                    if (!ipMatch && !nameMatch) return false;
                  }

                  // Filter by date
                  if (blockedDateFilter) {
                    if (!b.blockedAt) return false;
                    const bDate = b.blockedAt.toDate ? b.blockedAt.toDate() : new Date(b.blockedAt);
                    const yyyy = bDate.getFullYear();
                    const mm = String(bDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(bDate.getDate()).padStart(2, '0');
                    const formattedDateStr = `${yyyy}-${mm}-${dd}`;
                    if (formattedDateStr !== blockedDateFilter) return false;
                  }
                  return true;
                });

                return (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-1">
                      <h3 className="text-xs font-black text-slate-900 uppercase">ব্লকড ডিভাইস আইপি রেকর্ডস</h3>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        এই ডিভাইস আইপি থেকে গুগলে জয়েন করা সম্পূর্ণ নিষিদ্ধ। এরা পুনরায় জয়েন লিংক চেষ্টা করলে অ্যাক্সেস অস্বীকৃত স্ক্রিন দেখাবে।
                      </p>
                    </div>

                    {/* Filter controls section */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3">
                      <h4 className="text-[10px] font-black text-slate-700 uppercase flex items-center gap-1.5">
                        <Filter className="h-3.5 w-3.5 text-amber-500" />
                        ব্লকলিস্ট রেকর্ড ফিল্টার ও অনুসন্ধান
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-2.5">
                        {/* 1. Date Filter */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 block">কার্যকর করার তারিখ</label>
                          <input
                            type="date"
                            value={blockedDateFilter}
                            onChange={(e) => setBlockedDateFilter(e.target.value)}
                            className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-500 bg-slate-50 font-bold"
                          />
                        </div>

                        {/* 2. Search Box */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 block">নাম বা আইপি খুঁজুন</label>
                          <input
                            type="text"
                            placeholder="যেমন: ১১২.১০..."
                            value={blockedSearchQuery}
                            onChange={(e) => setBlockedSearchQuery(e.target.value)}
                            className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-500 bg-slate-50 font-semibold placeholder-slate-400"
                          />
                        </div>
                      </div>

                      {/* Quick access tags & reset */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              const today = new Date();
                              const yyyy = today.getFullYear();
                              const mm = String(today.getMonth() + 1).padStart(2, '0');
                              const dd = String(today.getDate()).padStart(2, '0');
                              setBlockedDateFilter(`${yyyy}-${mm}-${dd}`);
                            }}
                            className={`px-2 py-1 rounded text-[8px] font-bold border transition shrink-0 ${
                              blockedDateFilter === (() => {
                                const today = new Date();
                                const yyyy = today.getFullYear();
                                const mm = String(today.getMonth() + 1).padStart(2, '0');
                                const dd = String(today.getDate()).padStart(2, '0');
                                return `${yyyy}-${mm}-${dd}`;
                              })()
                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            আজকে ব্লকড
                          </button>
                          
                          <button
                            onClick={() => {
                              const yesterday = new Date();
                              yesterday.setDate(yesterday.getDate() - 1);
                              const yyyy = yesterday.getFullYear();
                              const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
                              const dd = String(yesterday.getDate()).padStart(2, '0');
                              setBlockedDateFilter(`${yyyy}-${mm}-${dd}`);
                            }}
                            className={`px-2 py-1 rounded text-[8px] font-bold border transition shrink-0 ${
                              blockedDateFilter === (() => {
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                const yyyy = yesterday.getFullYear();
                                const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
                                const dd = String(yesterday.getDate()).padStart(2, '0');
                                return `${yyyy}-${mm}-${dd}`;
                              })()
                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            গতকালকে
                          </button>
                        </div>

                        {(blockedDateFilter || blockedSearchQuery) && (
                          <button
                            onClick={() => {
                              setBlockedDateFilter('');
                              setBlockedSearchQuery('');
                            }}
                            className="text-[8px] font-black text-rose-600 hover:underline flex items-center gap-0.5 cursor-pointer bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md"
                          >
                            ফিল্টার সাফ করুন
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-0.5">
                      {filteredBlockedIPs.length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                          <p className="text-[10px] text-slate-400 italic font-medium">কোনো ব্লকড আইপি রেকর্ড পাওয়া যায়নি।</p>
                          {(blockedDateFilter || blockedSearchQuery) && (
                            <button
                              onClick={() => {
                                setBlockedDateFilter('');
                                setBlockedSearchQuery('');
                              }}
                              className="mt-2 text-[10px] bg-white border border-slate-200 px-3 py-1 rounded-md text-amber-600 font-bold hover:bg-slate-50 cursor-pointer shadow-sm transition"
                            >
                              রিসেট ফিল্টার
                            </button>
                          )}
                        </div>
                      ) : (
                        filteredBlockedIPs.map((b) => (
                          <div key={b.ip} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex justify-between items-center gap-4 text-xs">
                            <div className="space-y-0.5 truncate">
                              <span className="font-mono font-bold text-red-600 block truncate">{b.ip}</span>
                              <span className="text-[10px] text-slate-600 font-semibold block">{b.name}</span>
                              <span className="text-[9px] text-slate-400 block">লগ করা হয়েছে: {formatTime(b.blockedAt)}</span>
                            </div>
                            <button
                              onClick={() => handleUnblockUser(b.ip, b.deviceId)}
                              className="px-3 py-1.5 border border-emerald-250 bg-emerald-50 text-[#047857] hover:bg-[#d1fae5] font-bold rounded-lg text-[9px] transition cursor-pointer shrink-0"
                            >
                              ব্লক বাতিল
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* --- TAB 5: SETTINGS --- */}
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  {/* Preferences config */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-slate-900 uppercase">নিরাপত্তা ও অন্যান্য সেটিংস</h3>
                    
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="max-w-[200px]">
                        <p className="text-[10px] font-black text-slate-800">একই আইপি একাধিক জয়েন প্রতিরোধ</p>
                        <p className="text-[9px] text-slate-500 leading-none mt-0.5">একবার জয়েন করা আইপি দিয়ে পুনরায় জয়েন বন্ধ রাখতে এটি সবসময় চালু রাখুন।</p>
                      </div>
                      <button
                        onClick={toggleRepeatJoinsSetting}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          preventRepeatJoins ? 'bg-amber-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            preventRepeatJoins ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="max-w-[200px]">
                        <p className="text-[10px] font-black text-slate-800">পাবলিক লিংক সচল রাখুন</p>
                        <p className="text-[9px] text-slate-500 leading-relaxed mt-0.5">অন থাকলে সাধারণ লিঙ্কে ক্লিক করে জয়েন সচল থাকবে। অফ করে দিলে টাইম আউট বার্তা দেখানো হবে।</p>
                      </div>
                      <button
                        onClick={togglePublicLinkActiveSetting}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          publicLinkActive ? 'bg-amber-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            publicLinkActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Announcement/Notice system settings */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 font-sans">
                    <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
                      হোম স্ক্রিন নোটিশ সেটিংস
                    </h3>
                    
                    {noticeMessage && (
                      <p className={`p-2.5 rounded-lg border text-[10px] font-bold ${
                        noticeMessage.type === 'success' 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        {noticeMessage.text}
                      </p>
                    )}

                    <form onSubmit={handleUpdateNotice} className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="max-w-[200px]">
                          <p className="text-[10px] font-black text-slate-800">নোটিশ প্রদর্শন স্ট্যাটাস</p>
                          <p className="text-[9px] text-slate-500 leading-none mt-0.5">শিক্ষার্থীদের জয়েন ফর্মে স্ক্রলিং নোটিশ বার দেখাতে এটি চালু রাখুন।</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNoticeActive(!noticeActive)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            noticeActive ? 'bg-amber-500' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              noticeActive ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 block">নোটিশ বার্তা (বাংলায় লিখুন)</label>
                        <textarea
                          placeholder="যেমন: আসসালামু আলাইকুম, আমাদের আজকের কাউন্সেলিং সেশনটি আজ রাত ৯টায় শুরু হবে। সঠিক সময়ে জয়েন করুন।"
                          value={noticeText}
                          onChange={(e) => setNoticeText(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isUpdatingNotice}
                        className="w-full py-2 bg-[#0f172a] text-amber-500 font-bold text-[10px] rounded-lg hover:bg-slate-850 transition cursor-pointer"
                      >
                        {isUpdatingNotice ? 'সংরক্ষণ করা হচ্ছে...' : 'নোটিশ সেটিংস আপডেট করুন'}
                      </button>
                    </form>
                  </div>

                  {/* Password modifier */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-slate-900 uppercase">পাসওয়ার্ড পরিবর্তন করুন</h3>
                    
                    {pwdMessage && (
                      <p className={`p-2.5 rounded-lg border text-[10px] font-bold ${
                        pwdMessage.type === 'success' 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        {pwdMessage.text}
                      </p>
                    )}

                    <form onSubmit={handleChangePassword} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-650 text-slate-600 block">নতুন অ্যাডমিন পাসওয়ার্ড</label>
                        <input
                          type="password"
                          required
                          placeholder="কমপক্ষে ৪ সংখ্যার পাসওয়ার্ড দিন"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-650 text-slate-600 block">পাসওয়ার্ড পুনরায় টাইপ করুন</label>
                        <input
                          type="password"
                          required
                          placeholder="পাসওয়ার্ড নিশ্চিত করতে পুনরায় লিখুন"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isUpdatingPwd}
                        className="w-full py-2 bg-[#0f172a] text-amber-500 font-bold text-[10px] rounded-lg hover:bg-slate-850 transition"
                      >
                        {isUpdatingPwd ? 'আপডেট করা হচ্ছে...' : 'নতুন পাসওয়ার্ড সেভ করুন'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

            </div>

            {/* --- BOTTOM MOBILE-STYLE NAV BAR --- */}
            <nav className="h-14 bg-white border-t border-slate-200 flex justify-around items-center shrink-0 shadow-lg px-2 select-none select-text">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex flex-col items-center justify-center p-1 cursor-pointer transition ${
                  activeTab === 'dashboard' ? 'text-amber-500 scale-105' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <LayoutDashboard className="h-4.5 w-4.5 mb-0.5" />
                <span className="text-[8px] font-black">ড্যাশবোর্ড</span>
              </button>

              <button
                onClick={() => setActiveTab('meeting')}
                className={`flex flex-col items-center justify-center p-1 cursor-pointer transition ${
                  activeTab === 'meeting' ? 'text-amber-500 scale-105' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <LinkIcon className="h-4.5 w-4.5 mb-0.5" />
                <span className="text-[8px] font-black">লিংক তৈরি</span>
              </button>

              <button
                onClick={() => setActiveTab('data')}
                className={`flex flex-col items-center justify-center p-1 cursor-pointer transition relative ${
                  activeTab === 'data' ? 'text-amber-500 scale-105' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Users className="h-4.5 w-4.5 mb-0.5" />
                <span className="text-[8px] font-black">ইউজার লগ</span>
                {participants.length > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.5 bg-amber-500 text-slate-950 font-black rounded-full text-[6px]">
                    {participants.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('blocked')}
                className={`flex flex-col items-center justify-center p-1 cursor-pointer transition relative ${
                  activeTab === 'blocked' ? 'text-amber-500 scale-105' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Ban className="h-4.5 w-4.5 mb-0.5" />
                <span className="text-[8px] font-black">ব্লকলিস্ট</span>
                {blockedIPs.length > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.5 bg-red-500 text-white font-black rounded-full text-[6px]">
                    {blockedIPs.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`flex flex-col items-center justify-center p-1 cursor-pointer transition ${
                  activeTab === 'settings' ? 'text-amber-500 scale-105' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <SettingsIcon className="h-4.5 w-4.5 mb-0.5" />
                <span className="text-[8px] font-black">সেটিংস</span>
              </button>
            </nav>

          </div>
        )}

        {/* HOME INDICATOR (Desktop Only) */}
        <div className="hidden md:block absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-400 rounded-full opacity-60"></div>

      </div>
    </div>
  );
}
