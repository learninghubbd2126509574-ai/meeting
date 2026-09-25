import React, { useState, useEffect } from "react";
import {
  db,
  auth,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import * as dbService from "../dbService";
import { SUPABASE_SETUP_SQL, SUPABASE_URL } from "../supabase";
import {
  signInAnonymously,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
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
  orderBy,
} from "firebase/firestore";
import {
  Lock,
  Link as LinkIcon,
  Users,
  UserCheck,
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
  ExternalLink,
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  Trophy,
  Crown,
  Medal,
  Award,
  Plus,
  Edit2,
  UserPlus,
  TrendingUp,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Meeting, Participant, BlockedIP, LeaderboardMember } from "../types";


// Helper function to extract user-friendly device info from userAgent
function getDeviceDetails(uaString?: string) {
  const ua = uaString || "";
  let name = "অন্যান্য ডিভাইস (Unknown)";
  let iconType: "phone" | "laptop" | "tablet" | "monitor" = "phone";

  if (!ua) {
    return { name, iconType };
  }

  const lowerUa = ua.toLowerCase();

  if (/iphone/i.test(lowerUa)) {
    name = "আইফোন (iPhone)";
    iconType = "phone";
  } else if (/ipad/i.test(lowerUa)) {
    name = "আইপ্যাড (iPad Tablet)";
    iconType = "tablet";
  } else if (/android/i.test(lowerUa)) {
    // Try to extract Android model name or brand
    let model = "Android Phone";

    const brands = [
      { regex: /samsung|sm-/i, label: "Samsung" },
      { regex: /redmi|xiaomi|mi /i, label: "Xiaomi/Redmi" },
      { regex: /oppo|cph|pafm/i, label: "Oppo" },
      { regex: /vivo|v\d{4}/i, label: "Vivo" },
      { regex: /realme|rmx/i, label: "Realme" },
      { regex: /oneplus|op\d+/i, label: "OnePlus" },
      { regex: /pixel \d+/i, label: "Google Pixel" },
      { regex: /huawei|hry/i, label: "Huawei" },
      { regex: /infinix/i, label: "Infinix" },
      { regex: /tecno/i, label: "Tecno" },
    ];

    const foundBrand = brands.find((b) => b.regex.test(ua));
    if (foundBrand) {
      model = foundBrand.label;
    } else {
      // Find possible device model in standard android string
      const match = ua.match(/\(([^)]+)\)/);
      if (match && match[1]) {
        const parts = match[1].split(";");
        const androidPartIdx = parts.findIndex((p) => p.includes("Android"));
        if (androidPartIdx !== -1 && androidPartIdx < parts.length - 1) {
          const possible = parts[androidPartIdx + 1].trim();
          if (possible && possible !== "K" && !possible.includes("Build")) {
            model = possible;
          }
        }
      }
    }

    if (/tablet/i.test(lowerUa)) {
      name = `অ্যান্ড্রয়েড ট্যাবলেট (${model})`;
      iconType = "tablet";
    } else {
      name = `অ্যান্ড্রয়েড ফোন (${model})`;
      iconType = "phone";
    }
  } else if (/windows/i.test(lowerUa)) {
    name = "উইন্ডোজ পিসি (Windows PC)";
    iconType = "monitor";
  } else if (/macintosh|mac os/i.test(lowerUa)) {
    name = "ম্যাক পিসি (Mac)";
    iconType = "laptop";
  } else if (/linux/i.test(lowerUa)) {
    name = "লিনাক্স পিসি (Linux)";
    iconType = "monitor";
  }

  return { name, iconType };
}

function formatBlockTime(timestampVal: any) {
  if (!timestampVal) return "আজকে";
  try {
    const d = timestampVal.toDate ? timestampVal.toDate() : new Date(timestampVal);
    if (isNaN(d.getTime())) return String(timestampVal);
    return d.toLocaleString("bn-BD", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: true,
    });
  } catch (e) {
    return String(timestampVal);
  }
}

function getTodayDateString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminPanel() {
  // Navigation & Authentication
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "meeting" | "data" | "demo" | "blocked" | "settings"
  >("dashboard");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMethod, setAuthMethod] = useState<"password" | "google" | null>(
    null,
  );

  // Login input
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Firestore Saved Settings
  const [savedPassword, setSavedPassword] = useState("4012");
  const [preventRepeatJoins, setPreventRepeatJoins] = useState(true);
  const [publicLinkActive, setPublicLinkActive] = useState(true);
  const [noticeText, setNoticeText] = useState("");
  const [noticeActive, setNoticeActive] = useState(false);
  const [isUpdatingNotice, setIsUpdatingNotice] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Demo settings states
  const [demoModeActive, setDemoModeActive] = useState(false);
  const [demoCode, setDemoCode] = useState("1234");
  const [isUpdatingDemoCode, setIsUpdatingDemoCode] = useState(false);
  const [demoCodeMessage, setDemoCodeMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Helper to load cached state from localStorage so figures appear instantly without 0 0 flashing
  const getCachedArray = <T,>(key: string): T[] => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  };

  // Real-time Data with instant local-storage cache hydration
  const [meetings, setMeetings] = useState<Meeting[]>(() => getCachedArray<Meeting>("ue_cache_meetings"));
  const [participants, setParticipants] = useState<Participant[]>(() => getCachedArray<Participant>("ue_cache_participants"));
  const [demoParticipants, setDemoParticipants] = useState<any[]>(() => getCachedArray<any>("ue_cache_demo_participants"));
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>(() => getCachedArray<BlockedIP>("ue_cache_blocked_ips"));
  const [blockedDevices, setBlockedDevices] = useState<any[]>(() => getCachedArray<any>("ue_cache_blocked_devices"));
  const [blockedUIDs, setBlockedUIDs] = useState<any[]>(() => getCachedArray<any>("ue_cache_blocked_uids"));
  const [hasCachedData] = useState(() => {
    try {
      return !!(localStorage.getItem("ue_cache_meetings") || localStorage.getItem("ue_cache_participants"));
    } catch {
      return false;
    }
  });
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isDeletingAllMeetings, setIsDeletingAllMeetings] = useState(false);
  const [isDeletingAllParticipants, setIsDeletingAllParticipants] = useState(false);

  const checkQuotaError = (err: any) => {
    const msg = err?.message || String(err || "");
    const code = err?.code || "";
    if (code === "resource-exhausted" || msg.includes("Quota") || msg.includes("quota")) {
      setQuotaExceeded(true);
      return true;
    }
    return false;
  };

  // Meeting form
  const [meetInput, setMeetInput] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isMeetLinkActive, setIsMeetLinkActive] = useState(true);
  const [copysuccess, setCopysuccess] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState(getTodayDateString);
  const [blockedSearchQuery, setBlockedSearchQuery] = useState("");
  const [blockedDateFilter, setBlockedDateFilter] = useState("");
  const [meetingsDateFilter, setMeetingsDateFilter] =
    useState(getTodayDateString);
  const [demoSearchQuery, setDemoSearchQuery] = useState("");
  const [demoDateFilter, setDemoDateFilter] = useState(getTodayDateString);

  // Manual Block/Unblock tool states
  const [manualBlockInput, setManualBlockInput] = useState("");
  const [manualBlockLoading, setManualBlockLoading] = useState(false);
  const [manualBlockMessage, setManualBlockMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // --- BULK ACTION STATES ---
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<
    string[]
  >([]);
  const [isBulkBlocking, setIsBulkBlocking] = useState(false);
  const [allBlockTip, setAllBlockTip] = useState(false);

  // Meeting schedule state
  const [meetingDateInput, setMeetingDateInput] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [meetingTimeInput, setMeetingTimeInput] = useState("10:00");

  // Deletion confirmation states (prevents native window.confirm blocks)
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(
    null,
  );
  const [deletingParticipantId, setDeletingParticipantId] = useState<
    string | null
  >(null);

  // Password Settings tab form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMessage, setPwdMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  // 1. Forced Logout on Mount for Sessionless Security on TV & Public devices
  useEffect(() => {
    // We clear any active localStorage fallback and force sign out of any cached sessions.
    // This ensures every time someone visits the Link or reloads, they MUST type the password newly.
    localStorage.removeItem("ue_admin_auth");
    try {
      signOut(auth);
    } catch (e) {
      console.warn("Forced initial signout error:", e);
    }

    setIsAuthenticated(false);
    setAuthMethod(null);

    // Retrieve active settings or initialize them
    async function fetchSettings() {
      try {
        const docRef = doc(db, "adminSettings", "settings");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSavedPassword(data.password || "4012");
          setPreventRepeatJoins(data.preventRepeatJoins !== false);
          setPublicLinkActive(data.publicLinkActive !== false);
          setNoticeText(data.noticeText || "");
          setNoticeActive(data.noticeActive === true);
          setDemoModeActive(data.demoModeActive === true);
          setDemoCode(data.demoCode || "1234");
        } else {
          // Initialize settings collection
          await setDoc(docRef, {
            password: "4012",
            preventRepeatJoins: true,
            publicLinkActive: true,
            noticeText: "",
            noticeActive: false,
            demoModeActive: false,
            demoCode: "1234",
          });
          setSavedPassword("4012");
          setPreventRepeatJoins(true);
          setPublicLinkActive(true);
          setNoticeText("");
          setNoticeActive(false);
          setDemoModeActive(false);
          setDemoCode("1234");
        }
      } catch (err) {
        checkQuotaError(err);
        console.warn(
          "Settings lookup restricted before auth, using fallback.",
          err,
        );
      }
    }

    fetchSettings();
  }, []);

  // 2. Real-time Listeners for Dashboard UI (Supabase Primary, Firestore Dual-write backup)
  useEffect(() => {
    if (!isAuthenticated) return;

    setIsDataLoading(true);

    // Supabase Subscriptions (No quota limits, high-speed realtime)
    const unsubSupabaseMeetings = dbService.subscribeMeetings((list) => {
      if (list) {
        setMeetings(list as any);
        try {
          localStorage.setItem("ue_cache_meetings", JSON.stringify(list));
        } catch (e) {}
        if (list.length > 0) {
          const activeItem = list.find((m) => m.active) || list[0];
          setMeetInput(activeItem.googleMeetLink);
          setIsMeetLinkActive(activeItem.active);
          const origin = window.location.origin.trim().replace(/\/$/, "");
          setGeneratedLink(`${origin}/?join=${activeItem.id}`);
        } else {
          setMeetInput("");
          setIsMeetLinkActive(false);
          setGeneratedLink(null);
        }
        setIsDataLoading(false);
      }
    });

    const unsubSupabaseParticipants = dbService.subscribeParticipants((list) => {
      if (list) {
        setParticipants(list as any);
        try {
          localStorage.setItem("ue_cache_participants", JSON.stringify(list));
        } catch (e) {}
      }
    });

    const unsubSupabaseDemo = dbService.subscribeDemoParticipants((list) => {
      if (list) {
        setDemoParticipants(list as any);
        try {
          localStorage.setItem("ue_cache_demo_participants", JSON.stringify(list));
        } catch (e) {}
      }
    });

    const unsubSupabaseBlocked = dbService.subscribeBlockedIPs((list) => {
      if (list) {
        setBlockedIPs(list as any);
        try {
          localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(list));
        } catch (e) {}
      }
    });

    const unsubSupabaseBlockedDevices = dbService.subscribeBlockedDevices((list) => {
      if (list) {
        setBlockedDevices(list);
        try {
          localStorage.setItem("ue_cache_blocked_devices", JSON.stringify(list));
        } catch (e) {}
      }
    });

    const unsubSupabaseBlockedUIDs = dbService.subscribeBlockedUIDs((list) => {
      if (list) {
        setBlockedUIDs(list);
        try {
          localStorage.setItem("ue_cache_blocked_uids", JSON.stringify(list));
        } catch (e) {}
      }
    });

    const unsubSupabaseSettings = dbService.subscribeAdminSettings((data) => {
      if (data) {
        if (data.password) setSavedPassword(data.password);
        if (data.preventRepeatJoins !== undefined) setPreventRepeatJoins(data.preventRepeatJoins);
        if (data.publicLinkActive !== undefined) setPublicLinkActive(data.publicLinkActive);
        if (data.noticeText !== undefined) setNoticeText(data.noticeText);
        if (data.noticeActive !== undefined) setNoticeActive(data.noticeActive);
        if (data.demoModeActive !== undefined) setDemoModeActive(data.demoModeActive);
        if (data.demoCode) setDemoCode(data.demoCode);
      }
    });

    return () => {
      unsubSupabaseMeetings();
      unsubSupabaseParticipants();
      unsubSupabaseDemo();
      unsubSupabaseBlocked();
      unsubSupabaseBlockedDevices();
      unsubSupabaseBlockedUIDs();
      unsubSupabaseSettings();
    };
  }, [isAuthenticated]);


  // 3. Handle Password Login
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      // Authenticate locally against already loaded savedPassword (instantly)
      const latestPassword = savedPassword || "4012";

      // Check if password matches latestPassword or fallback '4012'
      if (passwordInput === latestPassword || passwordInput === "4012") {
        // Authenticate anonymously FIRST so we have the required Firestore permission key
        try {
          // Timeout after 2500ms to prevent infinite hang on slow networks or blocked domains
          await Promise.race([
            signInAnonymously(auth),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
          ]);
        } catch (authErr: any) {
          console.warn(
            "Anonymous authentication notice or fallback:",
            authErr,
          );
          
          const errCode = authErr?.code || "";
          if (errCode === "auth/operation-not-allowed" || String(authErr).includes("operation-not-allowed")) {
            setLoginError(
              "আপনার ফায়ারবেস প্রজেক্টে Anonymous Authentication চালু করা নেই। অনুগ্রহ করে Firebase Console > Authentication > Sign-in method-এ গিয়ে Anonymous (বেনামী লগইন) চালু করুন।"
            );
            setIsLoggingIn(false);
            return;
          }
          
          if (String(authErr).includes("Timeout")) {
            setLoginError(
              "নেটওয়ার্কের সমস্যা বা স্লো কানেকশন। অনুগ্রহ করে আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
            );
            setIsLoggingIn(false);
            return;
          }
        }

        // Now that we are authenticated, we can update the database settings if needed
        if (passwordInput === "4012" && latestPassword !== "4012") {
          try {
            const docRef = doc(db, "adminSettings", "settings");
            await setDoc(
              docRef,
              { password: "4012", preventRepeatJoins: preventRepeatJoins },
              { merge: true },
            );
            setSavedPassword("4012");
          } catch (writeError) {
            console.warn(
              "Failed to sync Firestore settings to 4012",
              writeError,
            );
          }
        }

        setIsAuthenticated(true);
        setAuthMethod("password");
        setPasswordInput("");
        setEmailInput(""); // Reset email as well
      } else {
        setLoginError(
          "ভুল পাসওয়ার্ড। দয়া করে সঠিক পাসওয়ার্ড দিন।",
        );
      }
    } catch (err) {
      setLoginError("একটি সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
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

      if (email === "learninghubbd2126509574@gmail.com") {
        setIsAuthenticated(true);
        setAuthMethod("google");
      } else {
        await signOut(auth);
        setLoginError(
          "অ্যাক্সেস প্রত্যাখ্যান করা হয়েছে: এই গুগল অ্যাকাউন্টটি অনুমোদিত নয়।",
        );
        setIsAuthenticated(false);
      }
    } catch (err: any) {
      console.error(err);
      if (err?.code === "auth/popup-closed-by-user") {
        setLoginError(
          "গুগল লগইন পপ-আপ উইন্ডোটি আপনি বন্ধ করে দিয়েছেন। দয়া করে আবার চেষ্টা করুন এবং উইন্ডোটি সম্পূর্ণ খুলতে দিন।",
        );
      } else if (err?.code === "auth/popup-blocked") {
        setLoginError(
          "আপনার ব্রাউজার পপ-আপ উইন্ডো ব্লক করে রেখেছে। ব্রাউজারের সেটিংস থেকে পপ-আপ অ্যালাউ করুন এবং পুনরায় চেষ্টা করুন।",
        );
      } else {
        setLoginError(
          "গুগল লগইন সফল হয়নি। আপনি সাধারণ অ্যাডমিন পাসওয়ার্ড (২১২৬৫০) ব্যবহার করেও প্রবেশ করতে পারেন।",
        );
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
      const meetRef = doc(db, "meetings", meetingId);

      const meetingPayload = {
        googleMeetLink: meetInput.trim(),
        createdAt: serverTimestamp(),
        active: isMeetLinkActive,
        meetingDate: meetingDateInput,
        meetingTime: meetingTimeInput,
      };

      // Save to Supabase
      await dbService.saveMeeting({
        id: meetingId,
        googleMeetLink: meetInput.trim(),
        active: isMeetLinkActive,
        meetingDate: meetingDateInput,
        meetingTime: meetingTimeInput,
      });

      const newMeetingObj = {
        id: meetingId,
        googleMeetLink: meetInput.trim(),
        active: isMeetLinkActive,
        meetingDate: meetingDateInput,
        meetingTime: meetingTimeInput,
        createdAt: new Date().toISOString(),
      };
      setMeetings((prev) => [newMeetingObj as any, ...prev.filter((m) => m.id !== meetingId)]);

      const origin = window.location.origin.trim().replace(/\/$/, "");
      const fullJoinUrl = `${origin}/?join=${meetingId}`;
      setGeneratedLink(fullJoinUrl);
    } catch (err: any) {
      console.warn("Save meeting notice:", err);
    } finally {
      setIsSavingLink(false);
    }
  }

  // 6. Update individual active states of existing meeting
  async function toggleMeetingActive(mId: string, currentStatus: boolean) {
    try {
      await dbService.updateMeetingStatus(mId, !currentStatus);
      setMeetings((prev) =>
        prev.map((m) => (m.id === mId ? { ...m, active: !currentStatus } : m))
      );
    } catch (err) {
      console.warn("Toggle meeting active notice:", err);
    }
  }

  // 6.2. Permanent delete of meeting session
  async function handleDeleteMeeting(mId: string) {
    try {
      await dbService.deleteMeeting(mId);
      setMeetings((prev) => prev.filter((m) => m.id !== mId));
      if (generatedLink && generatedLink.includes(mId)) {
        setGeneratedLink(null);
      }
      setDeletingMeetingId(null);
    } catch (err: any) {
      console.warn("Delete meeting notice:", err);
    }
  }

  // 6.3. Permanent delete of all created meeting links
  async function handleDeleteAllMeetings() {
    if (meetings.length === 0) {
      alert("ডিলিট করার জন্য কোনো মিটিং লিংক পাওয়া যায়নি।");
      return;
    }

    const confirmed = window.confirm(
      `সতর্কতা: আপনি কি নিশ্চিতভাবে সমস্ত (${meetings.length}টি) তৈরি করা মিটিং লিংক ডিলিট করতে চান? লিংকগুলো মুছে ফেলা হলে শিক্ষার্থীরা পূর্বে তৈরি করা লিংকে প্রবেশ করতে পারবে না।`
    );
    if (!confirmed) return;

    setIsDeletingAllMeetings(true);
    try {
      // Delete from Supabase
      await dbService.deleteAllMeetings();

      // Clear local state and cache instantly
      setMeetings([]);
      setGeneratedLink(null);
      try {
        localStorage.removeItem("ue_cache_meetings");
      } catch (e) {}

      alert("সমস্ত মিটিং লিংক সফলভাবে মুছে ফেলা হয়েছে।");
    } catch (err: any) {
      console.error("Failed to delete all meetings:", err);
      alert("মিটিং লিংকগুলো ডিলিট করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
    } finally {
      setIsDeletingAllMeetings(false);
    }
  }

  // Formatting meeting date and time into elegant Bengali
  function formatMeetingDateTime(dateStr?: string, timeStr?: string) {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const monthsBg = [
          "জানুয়ারি",
          "ফেব্রুয়ারি",
          "মার্চ",
          "এপ্রিল",
          "মে",
          "জুন",
          "জুলাই",
          "আগস্ট",
          "সেপ্টেম্বর",
          "অক্টোবর",
          "নভেম্বর",
          "ডিসেম্বর",
        ];
        const monthIndex = parseInt(month, 10) - 1;
        const monthBg = monthsBg[monthIndex] || month;

        // Bengali digit converter
        const bgDigits: { [key: string]: string } = {
          "0": "০",
          "1": "১",
          "2": "২",
          "3": "৩",
          "4": "৪",
          "5": "৫",
          "6": "৬",
          "7": "৭",
          "8": "৮",
          "9": "৯",
        };
        const toBgNum = (numStr: string) =>
          numStr
            .split("")
            .map((char) => bgDigits[char] || char)
            .join("");

        let formattedTime = "";
        if (timeStr) {
          const tParts = timeStr.split(":");
          if (tParts.length >= 2) {
            let hour = parseInt(tParts[0], 10);
            const minute = tParts[1];
            let ampm = "সকাল";
            if (hour >= 12) {
              ampm = "বিকাল";
              if (hour > 12) hour -= 12;
            } else {
              if (hour === 0) hour = 12;
              if (hour >= 6 && hour < 12) ampm = "সকাল";
              else ampm = "রাত";
            }
            formattedTime = `, ${ampm} ${toBgNum(String(hour))}:${toBgNum(minute)} মিনিট`;
          }
        }

        return `${toBgNum(day)} ${monthBg} ${toBgNum(year)} ${formattedTime}`;
      }
    } catch (e) {
      console.warn("Date parsing error", e);
    }
    return `${dateStr} ${timeStr || ""}`;
  }

  // 7. Change Admin System Password
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMessage(null);

    if (newPassword.length < 4) {
      setPwdMessage({
        type: "error",
        text: "পাসওয়ার্ড অত্যন্ত ছোট! কমপক্ষে ৪ সংখ্যার পাসওয়ার্ড দিন।",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdMessage({
        type: "error",
        text: "পাসওয়ার্ড মিলেনি! দুটি পাসওয়ার্ড হুবহু এক হতে হবে।",
      });
      return;
    }

    try {
      setIsUpdatingPwd(true);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(docRef, { password: newPassword }, { merge: true }).catch((err) => checkQuotaError(err));
      await dbService.saveAdminSettings({ password: newPassword });
      setSavedPassword(newPassword);
      setPwdMessage({
        type: "success",
        text: "অ্যাডমিন পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!",
      });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwdMessage({
        type: "error",
        text: "পাসওয়ার্ড আপডেট করতে ব্যর্থ হয়েছে।",
      });
    } finally {
      setIsUpdatingPwd(false);
    }
  }

  // 8. Toggle Repeat Joins
  async function toggleRepeatJoinsSetting() {
    try {
      const nextVal = !preventRepeatJoins;
      setPreventRepeatJoins(nextVal);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(docRef, { preventRepeatJoins: nextVal }, { merge: true }).catch(() => {});
      await dbService.saveAdminSettings({ preventRepeatJoins: nextVal });
    } catch (err) {
      console.error("Failed to update repeat joins settings:", err);
    }
  }

  // 8.2. Toggle Public Link Active Setting
  async function togglePublicLinkActiveSetting() {
    try {
      const nextVal = !publicLinkActive;
      setPublicLinkActive(nextVal);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(docRef, { publicLinkActive: nextVal }, { merge: true }).catch(() => {});
      await dbService.saveAdminSettings({ publicLinkActive: nextVal });
    } catch (err) {
      console.error("Failed to update public link active settings:", err);
    }
  }

  // 8.1. Save Notice Settings
  async function handleUpdateNotice(e: React.FormEvent) {
    e.preventDefault();
    setNoticeMessage(null);
    try {
      setIsUpdatingNotice(true);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(
        docRef,
        {
          noticeText: noticeText.trim(),
          noticeActive: noticeActive,
        },
        { merge: mergeFirestoreNotice() },
      ).catch(() => {});
      await dbService.saveAdminSettings({
        noticeText: noticeText.trim(),
        noticeActive,
      });
      setNoticeMessage({
        type: "success",
        text: "চলমান নোটিশ এবং এর স্থিতি সফলভাবে সেভ করা হয়েছে!",
      });
    } catch (err: any) {
      setNoticeMessage({
        type: "error",
        text: "নোটিশ আপডেট করতে ব্যর্থ হয়েছে।",
      });
    } finally {
      setIsUpdatingNotice(false);
    }
  }

  function mergeFirestoreNotice() {
    return true;
  }

  // --- DEMO MODE HELPERS ---

  async function toggleDemoMode() {
    try {
      const nextVal = !demoModeActive;
      setDemoModeActive(nextVal);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(docRef, { demoModeActive: nextVal }, { merge: true }).catch(() => {});
      await dbService.saveAdminSettings({ demoModeActive: nextVal });
    } catch (err) {
      console.error("Failed to update demo mode status:", err);
    }
  }

  async function handleUpdateDemoCode(e: React.FormEvent) {
    e.preventDefault();
    setDemoCodeMessage(null);
    if (!/^\d{4}$/.test(demoCode)) {
      setDemoCodeMessage({
        type: "error",
        text: "কোডটি অবশ্যই ৪ সংখ্যার হতে হবে!",
      });
      return;
    }
    try {
      setIsUpdatingDemoCode(true);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(docRef, { demoCode: demoCode }, { merge: true }).catch(() => {});
      await dbService.saveAdminSettings({ demoCode });
      setDemoCodeMessage({
        type: "success",
        text: "ডেমো সিক্রেট কোড সফলভাবে আপডেট হয়েছে!",
      });
    } catch (err) {
      setDemoCodeMessage({
        type: "error",
        text: "কোড আপডেট করতে ব্যর্থ হয়েছে।",
      });
    } finally {
      setIsUpdatingDemoCode(false);
    }
  }

  async function handleBlockDemoUser(demoUser: any) {
    if (
      !window.confirm(
        `আপনি কি নিশ্চিতভাবে "${demoUser.name}"-কে ব্লক করতে চান?`,
      )
    )
      return;
    try {
      // Block IP
      const blockPayload: BlockedIP = {
        ip: demoUser.ip,
        name: `${demoUser.name} (Demo)`,
        deviceId: demoUser.deviceId || "Unknown",
        uid: demoUser.uid || "Unknown",
        blockedAt: new Date().toISOString(),
        reason: "অ্যাডমিন কর্তৃক ব্লকড (ডেমো)",
      };
      await dbService.blockIP(blockPayload);

      const blockRef = doc(db, "blockedIPs", demoUser.ip);
      await setDoc(blockRef, {
        ip: demoUser.ip,
        deviceId: demoUser.deviceId || "Unknown",
        uid: demoUser.uid || "Unknown",
        blockedAt: serverTimestamp(),
        name: demoUser.name + " (Demo)",
      });

      // Block DeviceId
      if (demoUser.deviceId && demoUser.deviceId !== "Unknown") {
        await dbService.blockDevice(demoUser.deviceId, demoUser.ip, demoUser.uid);
        const deviceRef = doc(db, "blockedDevices", demoUser.deviceId);
        await setDoc(deviceRef, {
          deviceId: demoUser.deviceId,
          browserFingerprint: demoUser.browserFingerprint || "",
          uid: demoUser.uid || "Unknown",
          blockedAt: serverTimestamp(),
          name: demoUser.name + " (Demo)",
        });
      }

      // Block UID
      if (demoUser.uid && demoUser.uid !== "Unknown") {
        await dbService.blockUID(demoUser.uid, demoUser.ip, demoUser.deviceId);
        const uidRef = doc(db, "blockedUIDs", demoUser.uid);
        await setDoc(uidRef, {
          uid: demoUser.uid,
          deviceId: demoUser.deviceId || "Unknown",
          blockedAt: serverTimestamp(),
          name: demoUser.name + " (Demo)",
        });
      }

      // Mark demo participant doc as blocked
      const demoRef = doc(db, "demoParticipants", demoUser.id);
      await setDoc(demoRef, { blocked: true }, { merge: true });

      setBlockedIPs((prev) => [blockPayload, ...prev.filter((b) => b.ip !== demoUser.ip)]);
      setDemoParticipants((prev) =>
        prev.map((d) => (d.id === demoUser.id || d.ip === demoUser.ip ? { ...d, blocked: true } : d))
      );
    } catch (err) {
      console.error("Failed to block demo user:", err);
    }
  }

  async function handleDeleteDemoLog(id: string) {
    if (!window.confirm("আপনি কি নিশ্চিতভাবে এই ডেমো লগটি মুছে ফেলতে চান?"))
      return;
    try {
      deleteDoc(doc(db, "demoParticipants", id)).catch((err) => checkQuotaError(err));
      await dbService.deleteDemoParticipant(id);
      setDemoParticipants((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.warn("Delete demo log notice:", err);
    }
  }

  // 9. Block user (adds IP to blockedIPs, blockedDevices, blockedUIDs and flags participant as blocked)
  async function handleBlockUser(participant: Participant) {
    try {
      // Block in Supabase
      await dbService.blockIP({
        ip: participant.ip,
        deviceId: participant.deviceId,
        uid: participant.uid || "Unknown",
        browserFingerprint: participant.browserFingerprint || "",
        name: participant.name,
      });
      if (participant.deviceId && participant.deviceId !== "Unknown") {
        await dbService.blockDevice(participant.deviceId, participant.ip, participant.uid);
      }
      if (participant.uid && participant.uid !== "Unknown") {
        await dbService.blockUID(participant.uid, participant.ip, participant.deviceId);
      }

      // Block the IP in Firestore
      const blockRef = doc(db, "blockedIPs", participant.ip);
      setDoc(blockRef, {
        ip: participant.ip,
        deviceId: participant.deviceId,
        uid: participant.uid || "Unknown",
        blockedAt: serverTimestamp(),
        name: participant.name,
      }).catch((err) => checkQuotaError(err));

      // Also block the Device ID for persistent blocking (bypasses VPN)
      if (participant.deviceId && participant.deviceId !== "Unknown") {
        const deviceRef = doc(db, "blockedDevices", participant.deviceId);
        setDoc(deviceRef, {
          deviceId: participant.deviceId,
          browserFingerprint: participant.browserFingerprint || "",
          uid: participant.uid || "Unknown",
          blockedAt: serverTimestamp(),
          name: participant.name,
        }).catch(() => {});
      }

      // Also block the UID
      if (participant.uid && participant.uid !== "Unknown") {
        const uidRef = doc(db, "blockedUIDs", participant.uid);
        setDoc(uidRef, {
          uid: participant.uid,
          deviceId: participant.deviceId || "Unknown",
          blockedAt: serverTimestamp(),
          name: participant.name,
        }).catch(() => {});
      }

      // Mark all participant entries with same IP, Device ID or UID as blocked
      const matchedParts = participants.filter(
        (p) =>
          p.ip === participant.ip ||
          (participant.deviceId !== "Unknown" &&
            p.deviceId === participant.deviceId) ||
          (participant.uid &&
            participant.uid !== "Unknown" &&
            p.uid === participant.uid),
      );

      for (const p of matchedParts) {
        const pRef = doc(db, "participants", p.id);
        updateDoc(pRef, { blocked: true }).catch(() => {});
      }
      const blockRecord: BlockedIP = {
        ip: participant.ip,
        name: participant.name,
        deviceId: participant.deviceId || "Unknown",
        uid: participant.uid || "Unknown",
        blockedAt: new Date().toISOString(),
        reason: "অ্যাডমিন কর্তৃক ব্লকড",
      };
      setBlockedIPs((prev) => [
        blockRecord,
        ...prev.filter((b) => b.ip !== participant.ip),
      ]);
      setParticipants((prev) =>
        prev.map((p) =>
          p.ip === participant.ip || (p.deviceId !== "Unknown" && p.deviceId === participant.deviceId)
            ? { ...p, blocked: true }
            : p
        )
      );
    } catch (err: any) {
      console.warn("Block user notice:", err);
    }
  }

  // 9.2. Bulk block selected participants in a single operation
  async function handleBulkBlock() {
    if (selectedParticipantIds.length === 0) return;
    try {
      setIsBulkBlocking(true);

      // Find unblocked participant entities to block
      const selectedParts = participants.filter(
        (p) => selectedParticipantIds.includes(p.id) && !p.blocked,
      );
      if (selectedParts.length === 0) {
        setSelectedParticipantIds([]);
        return;
      }

      // Gather unique attributes
      const uniqueIPs = Array.from(
        new Set(selectedParts.map((p) => p.ip).filter(Boolean)),
      ) as string[];
      const uniqueDevices = Array.from(
        new Set(
          selectedParts
            .map((p) => p.deviceId)
            .filter((d) => d && d !== "Unknown"),
        ),
      ) as string[];
      const uniqueUIDs = Array.from(
        new Set(
          selectedParts.map((p) => p.uid).filter((u) => u && u !== "Unknown"),
        ),
      ) as string[];

      // A: Add IP to blocklist
      for (const ip of uniqueIPs) {
        const part = selectedParts.find((p) => p.ip === ip);
        const blockRef = doc(db, "blockedIPs", ip);
        await setDoc(blockRef, {
          ip: ip,
          deviceId: part?.deviceId || "Unknown",
          uid: part?.uid || "Unknown",
          blockedAt: serverTimestamp(),
          name: part?.name || "Bulk Blocked",
        });
      }

      // B: Add Device ID to blocklist (optional bypass logic)
      for (const devId of uniqueDevices) {
        const part = selectedParts.find((p) => p.deviceId === devId);
        const deviceRef = doc(db, "blockedDevices", devId);
        await setDoc(deviceRef, {
          deviceId: devId,
          browserFingerprint: part?.browserFingerprint || "",
          uid: part?.uid || "Unknown",
          blockedAt: serverTimestamp(),
          name: part?.name || "Bulk Blocked",
        });
      }

      // C: Add UID to blocklist
      for (const uId of uniqueUIDs) {
        const part = selectedParts.find((p) => p.uid === uId);
        const uidRef = doc(db, "blockedUIDs", uId);
        await setDoc(uidRef, {
          uid: uId,
          deviceId: part?.deviceId || "Unknown",
          blockedAt: serverTimestamp(),
          name: part?.name || "Bulk Blocked",
        });
      }

      // D: Update blocked status for all matching participants in local view context
      const matchedAll = participants.filter(
        (p) =>
          uniqueIPs.includes(p.ip) ||
          (p.deviceId !== "Unknown" && uniqueDevices.includes(p.deviceId)) ||
          (p.uid !== "Unknown" && uniqueUIDs.includes(p.uid)),
      );

      for (const p of matchedAll) {
        const pRef = doc(db, "participants", p.id);
        await updateDoc(pRef, { blocked: true });
      }

      // Reset selection
      setSelectedParticipantIds([]);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, "blocks/bulk");
    } finally {
      setIsBulkBlocking(false);
    }
  }

  // 10. Unblock user (removes IP from blockedIPs, blockedDevices, blockedUIDs and updates participant flags)
  async function handleUnblockUser(
    targetIP: string,
    targetDeviceId?: string | null,
    targetUid?: string | null,
  ) {
    try {
      // 1. Unblock IP in Supabase
      if (targetIP) {
        await dbService.unblockIP(targetIP);
        const blockRef = doc(db, "blockedIPs", targetIP);
        deleteDoc(blockRef).catch(() => {});
      }

      // 2. Unblock Device if exists
      if (targetDeviceId && targetDeviceId !== "Unknown") {
        await dbService.unblockDevice(targetDeviceId);
        const deviceRef = doc(db, "blockedDevices", targetDeviceId);
        deleteDoc(deviceRef).catch(() => {});
      }

      // 3. Unblock UID if exists
      let finalUid = targetUid;
      if (!finalUid) {
        const found = participants.find(
          (p) =>
            p.ip === targetIP ||
            (targetDeviceId &&
              targetDeviceId !== "Unknown" &&
              p.deviceId === targetDeviceId),
        ) || demoParticipants.find(
          (p) =>
            p.ip === targetIP ||
            (targetDeviceId &&
              targetDeviceId !== "Unknown" &&
              p.deviceId === targetDeviceId),
        );
        if (found && found.uid) {
          finalUid = found.uid;
        }
      }

      if (finalUid && finalUid !== "Unknown") {
        await dbService.unblockUID(finalUid);
        const uidRef = doc(db, "blockedUIDs", finalUid);
        deleteDoc(uidRef).catch(() => {});
      }

      // 4. Update participants in Firestore
      const matchedParts = participants.filter(
        (p) =>
          (targetIP && p.ip === targetIP) ||
          (targetDeviceId && targetDeviceId !== "Unknown" && p.deviceId === targetDeviceId) ||
          (finalUid && finalUid !== "Unknown" && p.uid === finalUid),
      );

      for (const p of matchedParts) {
        const pRef = doc(db, "participants", p.id);
        updateDoc(pRef, { blocked: false }).catch(() => {});
      }

      // 5. Also unblock matched demo participants
      const matchedDemoParts = demoParticipants.filter(
        (p) =>
          (targetIP && p.ip === targetIP) ||
          (targetDeviceId && targetDeviceId !== "Unknown" && p.deviceId === targetDeviceId) ||
          (finalUid && finalUid !== "Unknown" && p.uid === finalUid),
      );

      for (const p of matchedDemoParts) {
        const demoRef = doc(db, "demoParticipants", p.id);
        updateDoc(demoRef, { blocked: false }).catch(() => {});
      }

      // 6. Update local react state
      setBlockedIPs((prev) =>
        prev.filter(
          (b) =>
            b.ip !== targetIP &&
            (!targetDeviceId || b.deviceId !== targetDeviceId) &&
            (!finalUid || b.uid !== finalUid)
        )
      );
      setParticipants((prev) =>
        prev.map((p) =>
          (targetIP && p.ip === targetIP) ||
          (targetDeviceId && p.deviceId === targetDeviceId) ||
          (finalUid && p.uid === finalUid)
            ? { ...p, blocked: false }
            : p
        )
      );
      setDemoParticipants((prev) =>
        prev.map((p) =>
          (targetIP && p.ip === targetIP) ||
          (targetDeviceId && p.deviceId === targetDeviceId) ||
          (finalUid && p.uid === finalUid)
            ? { ...p, blocked: false }
            : p
        )
      );
    } catch (err: any) {
      console.warn("Unblock user notice:", err);
    }
  }

  // 10.5 Manual Block or Unblock by IP, UID, or Device ID directly
  async function handleManualUnblockOrBlock(action: "unblock" | "block") {
    const rawVal = manualBlockInput.trim();
    if (!rawVal) return;
    setManualBlockLoading(true);
    setManualBlockMessage(null);

    try {
      let targetIP = "";
      let targetDeviceId = "";
      let targetUid = "";

      if (rawVal.toLowerCase().startsWith("uid-")) {
        targetUid = rawVal;
      } else if (rawVal.toLowerCase().startsWith("dev_")) {
        targetDeviceId = rawVal;
      } else {
        targetIP = rawVal;
      }

      if (action === "unblock") {
        await handleUnblockUser(targetIP, targetDeviceId, targetUid);
        setManualBlockMessage({
          type: "success",
          text: `সফলভাবে আনব্লক করা হয়েছে: ${rawVal}`,
        });
      } else {
        if (targetIP) {
          await dbService.blockIP({
            ip: targetIP,
            name: "ম্যানুয়াল ব্লক",
            deviceId: targetDeviceId,
            uid: targetUid,
          });
          const blockRef = doc(db, "blockedIPs", targetIP);
          await setDoc(blockRef, {
            ip: targetIP,
            deviceId: targetDeviceId || "Unknown",
            uid: targetUid || "Unknown",
            name: "ম্যানুয়াল ব্লক",
            blockedAt: serverTimestamp(),
          });
        }
        if (targetDeviceId) {
          await dbService.blockDevice(targetDeviceId, targetIP, targetUid);
          const deviceRef = doc(db, "blockedDevices", targetDeviceId);
          await setDoc(deviceRef, {
            deviceId: targetDeviceId,
            uid: targetUid || "Unknown",
            name: "ম্যানুয়াল ব্লক",
            blockedAt: serverTimestamp(),
          });
        }
        if (targetUid) {
          await dbService.blockUID(targetUid, targetIP, targetDeviceId);
          const uidRef = doc(db, "blockedUIDs", targetUid);
          await setDoc(uidRef, {
            uid: targetUid,
            deviceId: targetDeviceId || "Unknown",
            name: "ম্যানুয়াল ব্লক",
            blockedAt: serverTimestamp(),
          });
        }
        setManualBlockMessage({
          type: "success",
          text: `সফলভাবে স্থায়ী ব্লক করা হয়েছে: ${rawVal}`,
        });
      }
      setManualBlockInput("");
    } catch (err: any) {
      setManualBlockMessage({
        type: "error",
        text: `অপারেশন ব্যর্থ হয়েছে: ${err?.message || "Error"}`,
      });
    } finally {
      setManualBlockLoading(false);
    }
  }

  // 11. Delete participant history record
  async function handleDeleteParticipant(pId: string) {
    try {
      const pRef = doc(db, "participants", pId);
      deleteDoc(pRef).catch((err) => checkQuotaError(err));
      await dbService.deleteParticipant(pId);
      setParticipants((prev) => prev.filter((p) => p.id !== pId));
      setDeletingParticipantId(null);
    } catch (err: any) {
      console.warn("Delete participant notice:", err);
    }
  }

  // 11.2. Delete All Participants and Demo Participants records from database
  async function handleDeleteAllParticipants(targetType: "all" | "regular" | "demo" = "all") {
    const regularCount = participants.length;
    const demoCount = demoParticipants.length;
    const totalCount =
      targetType === "regular"
        ? regularCount
        : targetType === "demo"
        ? demoCount
        : regularCount + demoCount;

    if (totalCount === 0) {
      alert("ডিলিট করার মতো কোনো জয়েনিং রেকর্ড পাওয়া যায়নি।");
      return;
    }

    let confirmMsg = "";
    if (targetType === "regular") {
      confirmMsg = `সতর্কতা: আপনি কি নিশ্চিতভাবে সমস্ত (${regularCount} জন) শিক্ষার্থীর জয়েনিং হিস্ট্রি ও বিবরণ ডাটাবেস থেকে ডিলিট করতে চান?\n\n(মনে রাখবেন: ব্লক লিস্টের কোনো ডাটা ডিলিট হবে না, ব্লক ডাটা সুরক্ষিত থাকবে)`;
    } else if (targetType === "demo") {
      confirmMsg = `সতর্কতা: আপনি কি নিশ্চিতভাবে সমস্ত (${demoCount} জন) ডেমো ব্যবহারকারীর জয়েনিং রেকর্ড ডাটাবেস থেকে ডিলিট করতে চান?\n\n(মনে রাখবেন: ব্লক লিস্টের কোনো ডাটা ডিলিট হবে না, ব্লক ডাটা সুরক্ষিত থাকবে)`;
    } else {
      confirmMsg = `সতর্কতা: আপনি কি নিশ্চিতভাবে ডাটাবেস থেকে এ যাবতকালের সমস্ত (${regularCount} জন ইউজার ও ${demoCount} জন ডেমো) জয়েনিং ডাটা মুছে ফেলতে চান?\n\n(মনে রাখবেন: ব্লক লিস্টে Delete All হবে না, ব্লক লিস্ট সম্পূর্ণ অক্ষত ও সুরক্ষিত থাকবে)`;
    }

    if (!window.confirm(confirmMsg)) return;

    setIsDeletingAllParticipants(true);
    try {
      // 1. Delete from Supabase (instant and unthrottled)
      if (targetType === "all" || targetType === "regular") {
        await dbService.deleteAllParticipants();
      }
      if (targetType === "all" || targetType === "demo") {
        await dbService.deleteAllDemoParticipants();
      }

      // 2. Clear local states and cache instantly
      if (targetType === "regular" || targetType === "all") {
        setParticipants([]);
        setSelectedParticipantIds([]);
        try {
          localStorage.removeItem("ue_cache_participants");
        } catch (e) {}
      }

      if (targetType === "demo" || targetType === "all") {
        setDemoParticipants([]);
        try {
          localStorage.removeItem("ue_cache_demo_participants");
        } catch (e) {}
      }

      // 3. Fire-and-forget Firestore deletions asynchronously in the background (do not block)
      if (targetType === "all" || targetType === "regular") {
        participants.forEach((p) => {
          deleteDoc(doc(db, "participants", p.id)).catch(() => {});
        });
      }

      if (targetType === "all" || targetType === "demo") {
        demoParticipants.forEach((dp) => {
          deleteDoc(doc(db, "demoParticipants", dp.id)).catch(() => {});
        });
      }

      alert("জয়েনিং রেকর্ডসমূহ সফলভাবে মুছে ফেলা হয়েছে। ব্লকড তালিকা অক্ষত রয়েছে।");
    } catch (err: any) {
      console.error("Failed to delete records:", err);
      alert("রেকর্ড মুছতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
    } finally {
      setIsDeletingAllParticipants(false);
    }
  }

  // Logout Admin session
  async function handleLogout() {
    await signOut(auth);
    localStorage.removeItem("ue_admin_auth");
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
    if (!timestamp) return "সময় পাওয়া যায়নি";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  // Formatting block timestamp in clear Bengali date & time
  function formatBlockTime(timestamp: any) {
    if (!timestamp) return "সময় পাওয়া যায়নি";
    try {
      let date: Date;
      if (timestamp && typeof timestamp.toDate === "function") {
        date = timestamp.toDate();
      } else if (timestamp && typeof timestamp.seconds === "number") {
        date = new Date(timestamp.seconds * 1000);
      } else {
        date = new Date(timestamp);
      }

      if (isNaN(date.getTime())) return "সময় পাওয়া যায়নি";

      const bgDigits: { [key: string]: string } = {
        "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪",
        "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯"
      };
      const toBg = (num: number, pad = 2) =>
        String(num).padStart(pad, "0").split("").map((c) => bgDigits[c] || c).join("");

      const monthsBg = [
        "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
        "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"
      ];

      const year = toBg(date.getFullYear(), 4);
      const month = monthsBg[date.getMonth()];
      const day = toBg(date.getDate(), 1);

      let hour = date.getHours();
      const minute = toBg(date.getMinutes(), 2);
      const second = toBg(date.getSeconds(), 2);

      let period = "সকাল";
      if (hour >= 12) {
        period = hour >= 15 ? (hour >= 18 ? "রাত" : "বিকাল") : "দুপুর";
        if (hour > 12) hour -= 12;
      } else {
        if (hour === 0) hour = 12;
        if (hour < 6) period = "রাত";
      }
      const hourBg = toBg(hour, 1);

      return `${day} ${month} ${year}, ${period} ${hourBg}:${minute}:${second}`;
    } catch (e) {
      return "সময় পাওয়া যায়নি";
    }
  }

  function isSameDay(timestamp: any, filterDateStr: string) {
    if (!filterDateStr) return true;
    if (!timestamp) return false;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    // Parse YYYY-MM-DD manually to prevent UTC timezone offset discrepancies in JavaScript parsing
    const parts = filterDateStr.split("-");
    if (parts.length !== 3) return true;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    return (
      date.getFullYear() === year &&
      date.getMonth() + 1 === month &&
      date.getDate() === day
    );
  }

  // Filtering participants log list
  const filteredParticipants = participants.filter((p) => {
    const nameStr = (p.name || "").toLowerCase();
    const ipStr = p.ip || "";
    const uidStr = (p.uid || p.deviceId || "").toLowerCase();
    const qStr = (searchQuery || "").trim().toLowerCase();

    if (qStr) {
      // If searching, ignore the date filter so they can find records on any day
      return (
        nameStr.includes(qStr) || ipStr.includes(qStr) || uidStr.includes(qStr)
      );
    } else {
      // Normal flow: filter by selected date (defaults to today)
      const activeDate = dateFilter || getTodayDateString();
      return isSameDay(p.joinedAt, activeDate);
    }
  });

  // Filtering demo participants log list
  const filteredDemoParticipants = demoParticipants.filter((p) => {
    const nameStr = (p.name || "").toLowerCase();
    const gmailStr = (p.gmail || "").toLowerCase();
    const ipStr = p.ip || "";
    const uidStr = (p.uid || p.deviceId || "").toLowerCase();
    const qStr = (demoSearchQuery || "").trim().toLowerCase();

    if (qStr) {
      // If searching, ignore the date filter so they can find records on any day
      return (
        nameStr.includes(qStr) ||
        gmailStr.includes(qStr) ||
        ipStr.includes(qStr) ||
        uidStr.includes(qStr)
      );
    } else {
      // Normal flow: filter by selected date (defaults to today)
      const activeDate = demoDateFilter || getTodayDateString();
      return isSameDay(p.joinedAt, activeDate);
    }
  });

  // Dynamic helper to check if a participant (standard or demo) is currently blocked
  const isParticipantBlocked = (p: any) => {
    if (p.blocked) return true;
    const ipBlocked = blockedIPs.some((b) => b.ip && p.ip && b.ip === p.ip);
    const devBlocked = blockedDevices.some((d) => d.deviceId && p.deviceId && d.deviceId === p.deviceId);
    const uidBlocked = blockedUIDs.some((u) => u.uid && (p.uid === u.uid || p.id === u.uid));
    const matchedInIPs = blockedIPs.some((b) => {
      const ipMatch = b.ip && p.ip && b.ip === p.ip;
      const deviceMatch = b.deviceId && b.deviceId !== "Unknown" && p.deviceId && p.deviceId !== "Unknown" && b.deviceId === p.deviceId;
      const uidMatch = b.uid && b.uid !== "Unknown" && p.uid && p.uid !== "Unknown" && b.uid === p.uid;
      return ipMatch || deviceMatch || uidMatch;
    });
    return ipBlocked || devBlocked || uidBlocked || matchedInIPs;
  };

  // Get counts for "today" specifically to support daily reset counters
  const todayDateStr = getTodayDateString();
  const todayParticipantsCount = participants.filter((p) =>
    isSameDay(p.joinedAt, todayDateStr),
  ).length;
  const todayDemoParticipantsCount = demoParticipants.filter((p) =>
    isSameDay(p.joinedAt, todayDateStr),
  ).length;

  // Badge calculations showing active dynamic counts (matched active day count)
  const displayUserCount = filteredParticipants.length;
  const displayDemoCount = filteredDemoParticipants.length;

  // Filtering meetings log list by date
  const filteredMeetings = meetings.filter((m) => {
    const activeFilterDate = meetingsDateFilter || getTodayDateString();
    if (m.meetingDate) {
      return m.meetingDate === activeFilterDate;
    }
    return isSameDay(m.createdAt, activeFilterDate);
  });

  // Calculate public sharing link vs local dev test link
  const { publicLink, testLink } = (() => {
    if (!generatedLink) return { publicLink: "", testLink: "" };

    // The test link is always the current generated link from the active session
    const tLink = generatedLink;

    // The public link should use the -pre- origin if we are currently on a -dev- origin
    let pLink = generatedLink;
    if (pLink.includes("-dev-")) {
      pLink = pLink.replace("-dev-", "-pre-");
    }

    return { publicLink: pLink, testLink: tLink };
  })();

  // --- RENDERING CHASSIS ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 flex flex-col justify-start md:justify-center items-center p-0 sm:p-4 md:p-6 lg:p-8 select-text overflow-x-hidden font-sans">
      {/* RESPONSIVE APP-CONTAINER (Desktop & Mobile Optimized) */}
      <div className={`w-full ${!isAuthenticated ? "max-w-md my-auto" : "max-w-5xl my-0 md:my-4"} min-h-screen md:min-h-[88vh] bg-slate-50 md:rounded-3xl md:border md:border-slate-800 shadow-2xl flex flex-col relative overflow-hidden transition-all duration-200`}>

        {/* 1. LOGIN SCREEN (If not authenticated) */}
        {!isAuthenticated ? (
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 flex flex-col justify-center bg-slate-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="flex-1 flex flex-col justify-center space-y-6 max-w-sm mx-auto w-full"
            >
              <div className="text-center space-y-2.5">
                <span className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-full text-xs font-bold tracking-wide">
                  ম্যানেজমেন্ট পোর্টাল
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Admin Login
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  অ্যাডমিন প্যানেলে প্রবেশ করতে পাসওয়ার্ড টাইপ করে সরাসরি Admin Login বাটনে ক্লিক করুন।
                </p>
              </div>

              {loginError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex gap-2.5 text-xs text-rose-700 font-semibold leading-relaxed">
                  <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
                  <p>{loginError}</p>
                </div>
              )}

              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2 w-full">
                  <label className="block text-xs font-bold text-slate-700">
                    অ্যাডমিন পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                      <Lock className="h-4.5 w-4.5" />
                    </span>
                    <input
                      type="password"
                      required
                      autoFocus
                      autoComplete="new-password"
                      placeholder="পাসওয়ার্ড টাইপ করুন"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 text-sm transition shadow-xs font-medium"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-amber-400 text-sm font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                      <span>লগইন হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 text-amber-400" />
                      <span>Admin Login</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        ) : (
          // 2. MAIN LOGGED-IN ADMIN PANEL (Responsive App Layout)
          <div className="flex-1 flex flex-col bg-slate-50 pt-0 relative min-h-0 overflow-hidden w-full">
            {/* INNER HEADER ACCENTS */}
            <header className="px-4 py-3 bg-[#0f172a] text-white flex justify-between items-center shrink-0 border-b-2 border-amber-500 shadow-sm z-30">
              <div className="truncate">
                <h2 className="text-xs font-black text-amber-500 uppercase tracking-wider">
                  Unity Earning
                </h2>
                <p className="text-[10px] text-slate-300 font-bold truncate">
                  {activeTab === "dashboard" && "ড্যাশবোর্ড ওভারভিউ"}
                  {activeTab === "meeting" && "মিটিং লিংক তৈরি"}
                  {activeTab === "data" && "ইউজার লগ অ্যান্ড সেটিংস"}
                  {activeTab === "demo" && "ডেমো জয়েনার্স লগ"}
                  {activeTab === "blocked" && "ডিভাইস ব্লকড লিস্ট"}
                  {activeTab === "settings" && "সিস্টেম সেটিংস"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {generatedLink && (
                  <button
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: "Unity Earning Join Link",
                            text: "মিটিং সেশনে যোগ দিতে নিচের লিঙ্কে ক্লিক করুন:",
                            url: publicLink,
                          });
                        } catch (err: any) {
                          if (err.name !== "AbortError") {
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
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-4 custom-scrollbar">
              {/* --- TAB 1: DASHBOARD --- */}
              {activeTab === "dashboard" && (
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
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">
                          আপনার শেয়ারিং লিংক এখন তৈরি
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-500 font-bold leading-tight">
                          পাবলিক মিটিং লিংক:
                        </p>
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
                            {copysuccess ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => window.open(publicLink, "_blank")}
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
                                  title: "Unity Earning",
                                  text: "মিটিংয়ে জয়েন করুন",
                                  url: publicLink,
                                });
                              } catch (err: any) {
                                if (err.name !== "AbortError") {
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
                            ডানদিকের{" "}
                            <span className="underline font-bold text-slate-950">
                              Share
                            </span>{" "}
                            বাটনে ক্লিক করে{" "}
                            <span className="underline font-bold text-slate-950">
                              Publish
                            </span>{" "}
                            করার পর ৫-১০ সেকেন্ড অপেক্ষা করে পেজটি রিফ্রেশ দিন।
                            প্রথমবার সক্রিয় হতে সামান্য সময় লাগতে পারে।
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Indicators Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      onClick={() => setActiveTab("data")}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm select-none hover:border-amber-400 transition cursor-pointer"
                    >
                      <Users className="h-5 w-5 text-amber-500 mb-1" />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        আজকের জয়েনিং
                      </p>
                      <h3 className="text-xl font-black text-slate-900">
                        {isDataLoading && !hasCachedData ? (
                          <span className="inline-block w-12 h-6 bg-slate-200 animate-pulse rounded"></span>
                        ) : (
                          `${todayParticipantsCount} জন`
                        )}
                      </h3>
                    </div>

                    <div
                      onClick={() => setActiveTab("blocked")}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm select-none hover:border-red-400 transition cursor-pointer"
                    >
                      <Ban className="h-5 w-5 text-red-500 mb-1" />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        ব্লকড আইপি
                      </p>
                      <h3 className="text-xl font-black text-slate-900">
                        {isDataLoading && !hasCachedData ? (
                          <span className="inline-block w-12 h-6 bg-slate-200 animate-pulse rounded"></span>
                        ) : (
                          `${blockedIPs.length} টি`
                        )}
                      </h3>
                    </div>
                  </div>

                  <div
                    onClick={() => setActiveTab("meeting")}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between select-none hover:border-amber-400 transition cursor-pointer"
                  >
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-500 font-black uppercase">
                        মিটিং সেশন কন্ট্রোল
                      </p>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        {isDataLoading && !hasCachedData ? (
                          <span className="inline-block w-28 h-4 bg-slate-200 animate-pulse rounded"></span>
                        ) : (
                          `সক্রিয় মিটিং: ${meetings.filter((m) => m.active).length} টি`
                        )}
                      </h3>
                    </div>
                    <span className="p-2 bg-emerald-50 text-emerald-600 rounded-full flex items-center">
                      <CheckCircle className="h-5 w-5" />
                    </span>
                  </div>
                </div>
              )}


              {/* --- TAB 2: MEETING LINK GENERATION --- */}
              {activeTab === "meeting" && (
                <div className="space-y-4 font-sans">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-amber-500" />
                      গুগল মিট লিংক সেটআপ ও শিডিউলিং
                    </h3>

                    <form onSubmit={handleSaveMeeting} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600">
                          গুগল মিট (Google Meet) অরিজিনাল লিংক
                        </label>
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
                          <label className="text-[10px] font-bold text-slate-600">
                            সেশনের তারিখ (Date)
                          </label>
                          <input
                            type="date"
                            required
                            value={meetingDateInput}
                            onChange={(e) =>
                              setMeetingDateInput(e.target.value)
                            }
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600">
                            সেশনের সময় (Time)
                          </label>
                          <input
                            type="time"
                            required
                            value={meetingTimeInput}
                            onChange={(e) =>
                              setMeetingTimeInput(e.target.value)
                            }
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                          <p className="text-[10px] font-black text-slate-800">
                            পাবলিক জয়েন সেশন সচল
                          </p>
                          <p className="text-[9px] text-slate-500 leading-none mt-0.5">
                            অফ করলে শিক্ষার্থীরা মিটিংয়ে ঢুকতে পারবে না
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsMeetLinkActive(!isMeetLinkActive)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isMeetLinkActive ? "bg-amber-500" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isMeetLinkActive
                                ? "translate-x-[20px]"
                                : "translate-x-[0px]"
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
                          "কনফিগার সেশন এবং লিংক সক্রিয় করুন"
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
                              <span>
                                সেশনের নির্ধারিত সময়:{" "}
                                {formatMeetingDateTime(
                                  meetingDateInput,
                                  meetingTimeInput,
                                )}
                              </span>
                            </div>
                          )}

                          <h4 className="text-xs font-black text-[#92400e] leading-tight pt-1">
                            শিক্ষার্থীদের শেয়ার করার নতুন লিংক:
                          </h4>
                          <p className="text-[10px] text-slate-500 leading-normal mb-1">
                            এই লিংকটি কপি করে আপনার শিক্ষার্থীদের দিন। তারা এই
                            জয়েনিং ফর্ম পূরণ করে কুইক রিডাইরেক্ট হবে।
                          </p>
                          <div className="bg-white px-2.5 py-2.5 rounded-lg border border-slate-200 select-all font-mono text-[10px] font-semibold text-slate-700 truncate shadow-inner flex justify-between items-center gap-2">
                            <span className="truncate">{generatedLink}</span>
                            <button
                              onClick={handleCopy}
                              className="p-1.5 hover:bg-slate-100 text-amber-600 rounded-md shrink-0 transition"
                              title="কপি করুন"
                            >
                              {copysuccess ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleCopy}
                            className={`flex-1 py-2 rounded-lg text-[10px] font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition ${
                              copysuccess
                                ? "bg-emerald-600 text-white"
                                : "bg-[#0f172a] text-amber-500 hover:bg-[#1e293b]"
                            }`}
                          >
                            {copysuccess ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {copysuccess
                              ? "সফলভাবে কপি হয়েছে"
                              : "নতুন জয়েন লিংক কপি করুন"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Direct test on current environment domain
                              const activeTestUrl = generatedLink.includes(
                                "?join=",
                              )
                                ? `${window.location.origin}/?join=${generatedLink.split("?join=")[1]}`
                                : generatedLink;
                              window.open(activeTestUrl, "_blank");
                            }}
                            className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-amber-500 hover:text-white hover:border-amber-500 text-[10px] font-extrabold rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                            title="আপনার চলতি পেজে টেস্ট করুন"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>যাচাই</span>
                          </button>
                        </div>

                        <p className="text-[9.5px] text-[#92400e]/80 leading-relaxed font-semibold">
                          💡 <span className="font-bold">কোঅর্ডিনেটর টিপ:</span>{" "}
                          এটি পাবলিক করার আগে অবশ্যই ডানদিকের এডিটরে{" "}
                          <span className="underline font-bold text-slate-900">
                            Share/Publish
                          </span>{" "}
                          চাপবেন। তৎক্ষণাৎ টেস্ট করে দেখতে চাইলে ওপরের{" "}
                          <span className="font-bold text-slate-900 leading-none bg-slate-100 px-1 rounded">
                            যাচাই
                          </span>{" "}
                          বাটনটি চাপুন।
                        </p>
                      </motion.div>
                    )}
                  </div>

                  {/* Sessions logs preview */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="flex items-center justify-between w-full sm:w-auto gap-2">
                        <h3 className="text-xs font-black text-slate-900 uppercase">
                          পূর্বে তৈরি করা সেশন লগস ({filteredMeetings.length})
                        </h3>
                        {meetings.length > 0 && (
                          <button
                            type="button"
                            onClick={handleDeleteAllMeetings}
                            disabled={isDeletingAllMeetings}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 rounded-lg text-[9.5px] font-black transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                            title="ডাটাবেস থেকে পূর্বে তৈরি করা সমস্ত মিটিং লিংক ডিলিট করুন"
                          >
                            {isDeletingAllMeetings ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            <span>Delete All</span>
                          </button>
                        )}
                      </div>

                      {/* Interactive Meeting date filter requested at top */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-500 flex items-center gap-0.5">
                          <Filter className="h-3 w-3 text-amber-500" />
                          তারিখ ফিল্টার:
                        </span>
                        <input
                          type="date"
                          value={meetingsDateFilter}
                          onChange={(e) =>
                            setMeetingsDateFilter(e.target.value)
                          }
                          className="text-[9px] p-1 border border-slate-200 rounded bg-slate-50 font-bold focus:outline-none"
                        />
                        {meetingsDateFilter &&
                          meetingsDateFilter !== getTodayDateString() && (
                            <button
                              onClick={() =>
                                setMeetingsDateFilter(getTodayDateString())
                              }
                              className="text-[8px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200 font-bold cursor-pointer"
                            >
                              আজকের তারিখ
                            </button>
                          )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(() => {
                        if (filteredMeetings.length === 0) {
                          return (
                            <p className="text-[10px] text-slate-400 italic text-center py-4">
                              {meetingsDateFilter
                                ? "নির্বাচিত তারিখে কোনো সেশন সোর্স রেকর্ড পাওয়া যায়নি।"
                                : "কোনো রেকর্ড পাওয়া যায়নি।"}
                            </p>
                          );
                        }

                        return filteredMeetings.map((m) => (
                          <div
                            key={m.id}
                            className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-[10px]"
                          >
                            <div className="truncate space-y-0.5 max-w-[150px] sm:max-w-xs">
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono font-bold text-amber-700">
                                  {m.id}
                                </code>
                                <span
                                  className={`px-1 rounded-[4px] text-[8px] font-black ${
                                    m.active
                                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                      : "bg-slate-200 text-slate-600"
                                  }`}
                                >
                                  {m.active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-500 font-mono truncate">
                                {m.googleMeetLink}
                              </p>

                              {/* DISPLAY CUSTOM SCHEDULE DATE/TIME DIRECTLY UNDER ID/LINK */}
                              {m.meetingDate && (
                                <p className="text-[9px] text-amber-600 font-black flex items-center gap-0.5 mt-0.5 bg-amber-50 px-1 rounded w-fit border border-amber-100">
                                  <Calendar className="h-3 w-3 shrink-0" />
                                  <span>
                                    তারিখ ও সময়:{" "}
                                    {formatMeetingDateTime(
                                      m.meetingDate,
                                      m.meetingTime,
                                    )}
                                  </span>
                                </p>
                              )}
                            </div>

                            <div className="flex gap-1.5 shrink-0 items-center">
                              {deletingMeetingId === m.id ? (
                                <div className="flex items-center gap-1 bg-rose-50 p-1 rounded border border-rose-200 animate-fadeIn text-[8px]">
                                  <span className="text-[8px] text-rose-700 font-black shrink-0">
                                    ডিলিট করব?
                                  </span>
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
                                    onClick={() =>
                                      toggleMeetingActive(m.id, m.active)
                                    }
                                    className={`text-[9.5px] font-black px-2 py-0.5 aligned-middle rounded border transition cursor-pointer ${
                                      m.active
                                        ? "border-amber-250 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                        : "border-emerald-250 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    }`}
                                  >
                                    {m.active ? "বন্ধ" : "চালু"}
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
              {activeTab === "data" && (
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
                      <span className="text-[9px] text-slate-550 font-bold">
                        তারিখ দিয়ে ফিল্টার:
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={dateFilter}
                          onChange={(e) => setDateFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] focus:outline-none"
                        />
                        {dateFilter !== getTodayDateString() && (
                          <button
                            onClick={() => setDateFilter(getTodayDateString())}
                            className="text-[9px] border border-amber-200 bg-amber-50 text-amber-700 px-1.5 py-1 rounded hover:bg-amber-500 hover:text-white transition cursor-pointer font-bold shrink-0"
                          >
                            আজকে
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Participants table alternative layout for phone */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold text-slate-800">
                        অংশগ্রহণকারীদের বিবরণ ({filteredParticipants.length})
                      </h3>
                      {(participants.length > 0 || demoParticipants.length > 0) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAllParticipants("all")}
                          disabled={isDeletingAllParticipants}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 rounded-lg text-[9.5px] font-black transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                          title="সমস্ত ইউজার ও ডেমো জয়েনিং লগ ডিলিট করুন (ব্লক লিস্ট সংরক্ষিত থাকবে)"
                        >
                          {isDeletingAllParticipants ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          <span>Delete All</span>
                        </button>
                      )}
                    </div>

                    {/* BULK SELECTION CONTROLS (All Block / Select All) */}
                    {filteredParticipants.length > 0 && (
                      <div className="bg-red-50/70 border border-red-200 rounded-2xl p-4.5 space-y-3 shadow-xs">
                        {/* Title accent for All Block Option */}
                        <div className="flex items-center gap-2 border-b border-red-100 pb-2">
                          <Ban className="h-4 w-4 text-red-600 shrink-0" />
                          <div>
                            <h4 className="text-xs font-black text-red-900 uppercase tracking-tight">
                              অল ব্লক অপশন (All Block Engine)
                            </h4>
                            <p className="text-[9px] text-slate-550 leading-none mt-0.5">
                              সবাইকে টিক দিয়ে একসাথে স্থায়ী ব্লক করতে এই
                              প্যানেলটি ব্যবহার করুন।
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                          {/* Checked Select All */}
                          <div className="flex items-center gap-2 bg-white/90 border border-red-100 py-2 px-3 rounded-xl shadow-xs transition hover:bg-white shrink-0">
                            <input
                              type="checkbox"
                              id="selectAllParticipants"
                              checked={
                                filteredParticipants.filter((p) => !isParticipantBlocked(p))
                                  .length > 0 &&
                                filteredParticipants
                                  .filter((p) => !isParticipantBlocked(p))
                                  .every((p) =>
                                    selectedParticipantIds.includes(p.id),
                                  )
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  // Select all unblocked
                                  const unblockedIds = filteredParticipants
                                    .filter((p) => !isParticipantBlocked(p))
                                    .map((p) => p.id);
                                  setSelectedParticipantIds(unblockedIds);
                                } else {
                                  setSelectedParticipantIds([]);
                                }
                              }}
                              className="h-4.5 w-4.5 rounded border-slate-350 text-red-650 focus:ring-red-500 cursor-pointer"
                            />
                            <label
                              htmlFor="selectAllParticipants"
                              className="text-[10px] font-black text-slate-800 cursor-pointer select-none"
                            >
                              সবাইকে সিলেক্ট করুন (
                              {
                                filteredParticipants.filter((p) => !isParticipantBlocked(p))
                                  .length
                              }{" "}
                              জন)
                            </label>
                          </div>

                          {/* All Block Trigger Button (always visible, interactive depending on selection) */}
                          <div className="flex flex-col gap-1 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedParticipantIds.length === 0) {
                                  setAllBlockTip(true);
                                  setTimeout(() => setAllBlockTip(false), 5000);
                                } else {
                                  handleBulkBlock();
                                }
                              }}
                              disabled={isBulkBlocking}
                              className={`w-full sm:w-auto px-4 py-2.5 text-white font-black text-[10.5px] rounded-xl shadow-md transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer ${
                                selectedParticipantIds.length > 0
                                  ? "bg-red-650 hover:bg-red-700 hover:scale-[1.01] border border-red-550"
                                  : "bg-slate-400 hover:bg-slate-450 border border-slate-350"
                              }`}
                            >
                              {isBulkBlocking ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>ব্লক করা হচ্ছে...</span>
                                </>
                              ) : (
                                <>
                                  <Ban className="h-4 w-4" />
                                  <span>
                                    অল ব্লক করুন{" "}
                                    {selectedParticipantIds.length > 0
                                      ? `(${selectedParticipantIds.length} জন)`
                                      : ""}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Interactive Dynamic Warning Tip */}
                        {allBlockTip && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[9.5px] text-red-700 font-extrabold bg-white border border-red-200 py-1.5 px-3 rounded-lg text-center animate-fadeIn"
                          >
                            ⚠️ কোনো শিক্ষার্থী সিলেক্ট করা নেই! নিচে
                            শিক্ষার্থীদের নামের বামদিকের বাক্সে টিক দিয়ে সিলেক্ট
                            করুন, অথবা "সবাইকে সিলেক্ট করুন" বক্সে টিক দিয়ে "অল
                            block" এ ক্লিক করুন।
                          </motion.p>
                        )}
                      </div>
                    )}

                    {/* Participant logs listing (No max-h to display fully and utilize outer scrolling) */}
                    <div className="space-y-2">
                      {filteredParticipants.length === 0 ? (
                        <p className="text-[10px] text-slate-450 italic text-center py-4">
                          কোনো জয়েনিং লগ পাওয়া যায়নি।
                        </p>
                      ) : (
                        filteredParticipants.map((p) => {
                          const isSelected = selectedParticipantIds.includes(
                            p.id,
                          );
                          const isBlocked = isParticipantBlocked(p);
                          return (
                            <div
                              key={p.id}
                              className={`border rounded-xl p-3 shadow-xs space-y-2 text-xs transition ${
                                isSelected
                                  ? "bg-amber-50/55 border-amber-300 ring-1 ring-amber-300"
                                  : isBlocked
                                    ? "bg-slate-50/60 border-slate-200 opacity-80"
                                    : "bg-white border-slate-200"
                              }`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex items-start gap-2.5">
                                  {/* Checkbox wrapper - only allow selecting if not yet blocked */}
                                  {!isBlocked && (
                                    <div className="pt-0.5 shrink-0">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {
                                          if (isSelected) {
                                            setSelectedParticipantIds((prev) =>
                                              prev.filter((id) => id !== p.id),
                                            );
                                          } else {
                                            setSelectedParticipantIds(
                                              (prev) => [...prev, p.id],
                                            );
                                          }
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                                      />
                                    </div>
                                  )}

                                  <div>
                                    <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                      <span
                                        className={`h-2 w-2 rounded-full shrink-0 ${isBlocked ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`}
                                      ></span>
                                      {p.name}
                                    </h4>
                                    <div className="flex flex-col gap-0.5 mt-1 font-mono text-[9px] text-slate-550 leading-relaxed">
                                      <span>
                                        IP:{" "}
                                        <strong className="text-slate-800 font-bold">
                                          {p.ip || "Unknown"}
                                        </strong>
                                      </span>
                                      <span>
                                        UID:{" "}
                                        <strong className="text-[#1b6ffc] font-bold">
                                          {p.uid ||
                                            p.deviceId?.substring(
                                              p.deviceId.length - 8,
                                            ) ||
                                            "Unknown"}
                                        </strong>
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-1 shrink-0 items-center">
                                  {deletingParticipantId === p.id ? (
                                    <div className="flex items-center gap-1 bg-[#fff5f5] p-1 rounded border border-red-200 animate-fadeIn text-[8px]">
                                      <span className="text-[8px] text-red-700 font-extrabold shrink-0">
                                        ডিলিট?
                                      </span>
                                      <button
                                        onClick={() =>
                                          handleDeleteParticipant(p.id)
                                        }
                                        className="px-1.5 py-0.5 bg-red-600 text-white font-black text-[8px] rounded hover:bg-red-700 cursor-pointer"
                                      >
                                        হ্যাঁ
                                      </button>
                                      <button
                                        onClick={() =>
                                          setDeletingParticipantId(null)
                                        }
                                        className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-black text-[8px] rounded hover:bg-slate-300 cursor-pointer"
                                      >
                                        না
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setDeletingParticipantId(p.id)
                                      }
                                      title="লগ ডিলিট"
                                      className="p-1.5 border border-red-100 hover:bg-red-50 rounded text-red-500 hover:border-red-300 transition cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded border border-slate-100 text-[9px] text-slate-550">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  {formatTime(p.joinedAt)}
                                </span>
                              </div>

                              <div className="flex justify-end pt-1">
                                {isBlocked ? (
                                  <button
                                    onClick={() =>
                                      handleUnblockUser(p.ip, p.deviceId, p.uid)
                                    }
                                    className="px-2.5 py-1 border border-red-600 bg-red-600 text-white hover:bg-red-700 font-extrabold rounded text-[9px] transition cursor-pointer"
                                  >
                                    ব্লক সম্পন্ন হয়েছে
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleBlockUser(p)}
                                    className="px-2.5 py-1 border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 font-extrabold rounded text-[9px] transition cursor-pointer"
                                  >
                                    স্থায়ী ব্লক করুন
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB 3.5: DEMO LIST --- */}
              {activeTab === "demo" && (
                <div className="space-y-4">
                  {/* Filter and Search segment */}
                  <div className="space-y-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400">
                        <Search className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="শিক্ষার্থীর নাম, জিমেইল বা আইপি দিয়ে খুজুন..."
                        value={demoSearchQuery}
                        onChange={(e) => setDemoSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t pt-2 mt-2">
                      <span className="text-[9px] text-slate-500 font-bold">
                        তারিখ দিয়ে ফিল্টার:
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={demoDateFilter}
                          onChange={(e) => setDemoDateFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded p-1 text-[9px] focus:outline-none"
                        />
                        {demoDateFilter !== getTodayDateString() && (
                          <button
                            onClick={() =>
                              setDemoDateFilter(getTodayDateString())
                            }
                            className="text-[9px] border border-emerald-200 bg-emerald-50 text-emerald-700 px-1.5 py-1 rounded hover:bg-emerald-600 hover:text-white transition cursor-pointer font-bold shrink-0"
                          >
                            আজকে
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Demo participants table layout for phone */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold text-slate-800">
                        ডেমো ব্যবহারকারী লগ ({filteredDemoParticipants.length})
                      </h3>
                      <div className="flex items-center gap-1.5">
                        {demoParticipants.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAllParticipants("demo")}
                            disabled={isDeletingAllParticipants}
                            className="px-2 py-1 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 rounded-lg text-[9px] font-black transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                            title="ডাটাবেস থেকে সমস্ত ডেমো রেকর্ড ডিলিট করুন (ব্লক লিস্ট অক্ষত থাকবে)"
                          >
                            {isDeletingAllParticipants ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            <span>Delete All</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const currentFilter = demoDateFilter;
                            setDemoDateFilter("");
                            setTimeout(
                              () => setDemoDateFilter(currentFilter),
                              10,
                            );
                          }}
                          className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 px-2 py-1 rounded-lg cursor-pointer"
                        >
                          রিফ্রেশ করুন ↻
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {filteredDemoParticipants.length === 0 ? (
                        <p className="text-[10px] text-slate-450 italic text-center py-4">
                          কোনো ডেমো জয়েনিং লগ পাওয়া যায়নি।
                        </p>
                      ) : (
                        filteredDemoParticipants.map((p) => {
                          const isBlocked = isParticipantBlocked(p);
                          return (
                            <div
                              key={p.id}
                              className={`border rounded-xl p-3 shadow-xs space-y-2 text-xs transition ${
                                isBlocked
                                  ? "bg-slate-50/60 border-slate-200 opacity-80"
                                  : "bg-white border-slate-200"
                              }`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                    <span
                                      className={`h-2 w-2 rounded-full shrink-0 ${isBlocked ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`}
                                    ></span>
                                    {p.name}
                                  </h4>
                                  {p.gmail && (
                                    <p className="text-[10px] text-emerald-600 font-extrabold mt-0.5">
                                      {p.gmail}
                                    </p>
                                  )}
                                  <div className="flex flex-col gap-0.5 mt-1 font-mono text-[9px] text-slate-550 leading-relaxed">
                                    <span>
                                      IP:{" "}
                                      <strong className="text-slate-800 font-bold">
                                        {p.ip || "Unknown"}
                                      </strong>
                                    </span>
                                    <span>
                                      UID:{" "}
                                      <strong className="text-[#1b6ffc] font-bold">
                                        {p.uid ||
                                          p.deviceId?.substring(
                                            p.deviceId.length - 8,
                                          ) ||
                                          "Unknown"}
                                      </strong>
                                    </span>
                                    <span>
                                      ডিভাইস আইডি:{" "}
                                      <strong className="text-slate-800">
                                        {p.deviceId
                                          ? p.deviceId.substring(0, 16) + "..."
                                          : "Unknown"}
                                      </strong>
                                    </span>
                                    <span>
                                      জয়েন টাইম:{" "}
                                      <strong className="text-slate-850">
                                        {p.joinedAt
                                          ? new Date(
                                              p.joinedAt.seconds * 1000,
                                            ).toLocaleString("bn-BD", {
                                              hour: "numeric",
                                              minute: "numeric",
                                              second: "numeric",
                                              hour12: true,
                                            })
                                          : "N/A"}
                                      </strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-1.5 items-end justify-between self-stretch shrink-0">
                                  <button
                                    onClick={() => handleDeleteDemoLog(p.id)}
                                    title="লগ ডিলিট"
                                    className="p-1 border border-slate-100 hover:bg-rose-50 rounded text-slate-400 hover:text-red-500 hover:border-red-200 transition cursor-pointer"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>

                                  {!isBlocked ? (
                                    <button
                                      onClick={() => handleBlockDemoUser(p)}
                                      className="px-2 py-1 bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 rounded-[7px] text-[8.5px] font-black transition cursor-pointer"
                                    >
                                      স্থায়ী ব্লক করুন
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        handleUnblockUser(
                                          p.ip,
                                          p.deviceId,
                                          p.uid,
                                        )
                                      }
                                      className="px-2 py-1 bg-red-600 border border-red-600 text-white hover:bg-red-700 rounded-[7px] text-[8.5px] font-black transition cursor-pointer font-sans"
                                    >
                                      ব্লক সম্পন্ন হয়েছে
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB 4: BLOCKED LIST --- */}
              {activeTab === "blocked" &&
                (() => {
                  // Synthesize and unify blocked items from blockedIPs state, blocked participants, and blocked demo participants
                  const map = new Map<
                    string,
                    {
                      key: string;
                      ip: string;
                      name: string;
                      uid: string;
                      deviceId: string;
                      blockedAt: any;
                      deviceDetails?: {
                        name: string;
                        iconType: "phone" | "laptop" | "tablet" | "monitor";
                      };
                      userType: string;
                    }
                  >();

                  // 1. Process explicit blockedIPs records
                  blockedIPs.forEach((b) => {
                    const key =
                      b.ip || b.uid || b.deviceId || Math.random().toString();
                    const matchedP = participants.find(
                      (p) =>
                        (b.ip && p.ip === b.ip) ||
                        (b.uid && b.uid !== "Unknown" && p.uid === b.uid) ||
                        (b.deviceId &&
                          b.deviceId !== "Unknown" &&
                          p.deviceId === b.deviceId),
                    );
                    const matchedD = demoParticipants.find(
                      (p) =>
                        (b.ip && p.ip === b.ip) ||
                        (b.uid && b.uid !== "Unknown" && p.uid === b.uid) ||
                        (b.deviceId &&
                          b.deviceId !== "Unknown" &&
                          p.deviceId === b.deviceId),
                    );

                    const matchedName =
                      b.name || matchedP?.name || matchedD?.name || "নাম পাওয়া যায়নি";
                    const matchedUid =
                      b.uid && b.uid !== "Unknown"
                        ? b.uid
                        : matchedP?.uid || matchedD?.uid || "N/A";
                    const matchedDevId =
                      b.deviceId && b.deviceId !== "Unknown"
                        ? b.deviceId
                        : matchedP?.deviceId || matchedD?.deviceId || "N/A";
                    const userAgent = matchedP?.userAgent || matchedD?.userAgent || "";
                    const devInfo = getDeviceDetails(userAgent);

                    map.set(key, {
                      key,
                      ip: b.ip || matchedP?.ip || matchedD?.ip || "N/A",
                      name: matchedName,
                      uid: matchedUid,
                      deviceId: matchedDevId,
                      blockedAt:
                        b.blockedAt ||
                        matchedP?.joinedAt ||
                        matchedD?.joinedAt ||
                        new Date().toISOString(),
                      deviceDetails: devInfo,
                      userType: matchedD ? "ডেমো ইউজার" : "সাধারণ ইউজার",
                    });
                  });

                  // 2. Add participants with blocked === true
                  participants
                    .filter((p) => p.blocked)
                    .forEach((p) => {
                      const key = p.ip || p.uid || p.id;
                      if (!map.has(key)) {
                        const devInfo = getDeviceDetails(p.userAgent);
                        map.set(key, {
                          key,
                          ip: p.ip || "N/A",
                          name: p.name || "নাম পাওয়া যায়নি",
                          uid: p.uid || p.id || "N/A",
                          deviceId: p.deviceId || "N/A",
                          blockedAt: p.joinedAt || new Date().toISOString(),
                          deviceDetails: devInfo,
                          userType: "সাধারণ ইউজার",
                        });
                      }
                    });

                  // 3. Add demo participants with blocked === true
                  demoParticipants
                    .filter((p) => p.blocked)
                    .forEach((p) => {
                      const key = p.ip || p.uid || p.id;
                      if (!map.has(key)) {
                        const devInfo = getDeviceDetails(p.userAgent);
                        map.set(key, {
                          key,
                          ip: p.ip || "N/A",
                          name: `${p.name || "নাম পাওয়া যায়নি"} (Demo)`,
                          uid: p.uid || p.id || "N/A",
                          deviceId: p.deviceId || "N/A",
                          blockedAt: p.joinedAt || new Date().toISOString(),
                          deviceDetails: devInfo,
                          userType: "ডেমো ইউজার",
                        });
                      }
                    });

                  const unifiedList = Array.from(map.values());

                  // Filter by search query (Name, IP, UID, DeviceId, UserType) & Date filter
                  const filteredBlockedList = unifiedList.filter((b) => {
                    if (blockedSearchQuery) {
                      const queryLower = blockedSearchQuery.toLowerCase().trim();
                      const ipMatch = b.ip?.toLowerCase().includes(queryLower);
                      const nameMatch = b.name?.toLowerCase().includes(queryLower);
                      const uidMatch = b.uid?.toLowerCase().includes(queryLower);
                      const devMatch = b.deviceId?.toLowerCase().includes(queryLower);
                      const typeMatch = b.userType?.toLowerCase().includes(queryLower);
                      if (!ipMatch && !nameMatch && !uidMatch && !devMatch && !typeMatch)
                        return false;
                    }

                    if (blockedDateFilter) {
                      if (!b.blockedAt) return false;
                      const bDate = b.blockedAt.toDate
                        ? b.blockedAt.toDate()
                        : new Date(b.blockedAt);
                      const yyyy = bDate.getFullYear();
                      const mm = String(bDate.getMonth() + 1).padStart(2, "0");
                      const dd = String(bDate.getDate()).padStart(2, "0");
                      const formattedDateStr = `${yyyy}-${mm}-${dd}`;
                      if (formattedDateStr !== blockedDateFilter) return false;
                    }
                    return true;
                  });

                  return (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                            <ShieldAlert className="h-4 w-4 text-rose-600" />
                            ব্লকড ইউজার, আইপি ও ইউআইডি তালিকা ({filteredBlockedList.length})
                          </h3>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal">
                          ব্লককৃত ইউজারদের আইপি, নাম, ইউআইডি এবং ব্লক করার সময় নিচে উল্লেখ রয়েছে। যেকোনো ইউজারকে আনব্লক করতে ডানপাশের <strong>আনব্লক করুন</strong> বাটনে ক্লিক করুন।
                        </p>
                      </div>

                      {/* DIRECT MANUAL UNBLOCK / BLOCK TOOL */}
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 rounded-xl p-3.5 shadow-sm space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-black text-amber-900 uppercase flex items-center gap-1.5">
                            ⚡ সরাসরি আইপি / ইউআইডি (UID) / ডিভাইস আইডি আনব্লক বা ব্লক করুন
                          </h4>
                        </div>
                        <p className="text-[9.5px] text-amber-800 leading-tight font-medium">
                          যেকোনো ডিভাইস আইপি (যেমন <strong>202.47.164.169</strong>), ইউআইডি (যেমন <strong>UID-852424</strong>) বা ডিভাইস আইডি (যেমন <strong>dev_...</strong>) পেস্ট করে সরাসরি আনব্লক বা ব্লক করুন।
                        </p>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="আইপি (e.g. 202.47.164.169) বা ইউআইডি (e.g. UID-852424) লিখুন..."
                            value={manualBlockInput}
                            onChange={(e) => setManualBlockInput(e.target.value)}
                            className="flex-1 text-[11px] px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white font-mono font-bold text-slate-900"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleManualUnblockOrBlock("unblock")}
                              disabled={manualBlockLoading || !manualBlockInput.trim()}
                              className="flex-1 sm:flex-none px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10.5px] rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                            >
                              ✓ আনব্লক করুন
                            </button>
                            <button
                              type="button"
                              onClick={() => handleManualUnblockOrBlock("block")}
                              disabled={manualBlockLoading || !manualBlockInput.trim()}
                              className="flex-1 sm:flex-none px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-[10.5px] rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                            >
                              ✕ ব্লক করুন
                            </button>
                          </div>
                        </div>

                        {manualBlockMessage && (
                          <div
                            className={`p-2 rounded-lg text-[10px] font-extrabold ${
                              manualBlockMessage.type === "success"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : "bg-rose-100 text-rose-800 border border-rose-200"
                            }`}
                          >
                            {manualBlockMessage.text}
                          </div>
                        )}
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
                            <label className="text-[9px] font-black text-slate-500 block">
                              ব্লক করার তারিখ
                            </label>
                            <input
                              type="date"
                              value={blockedDateFilter}
                              onChange={(e) =>
                                setBlockedDateFilter(e.target.value)
                              }
                              className="w-full text-[10px] px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-500 bg-slate-50 font-bold"
                            />
                          </div>

                          {/* 2. Search Box */}
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 block">
                              নাম, আইপি বা ইউআইডি খুঁজুন
                            </label>
                            <input
                              type="text"
                              placeholder="নাম বা আইপি বা ইউআইডি..."
                              value={blockedSearchQuery}
                              onChange={(e) =>
                                setBlockedSearchQuery(e.target.value)
                              }
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
                                const mm = String(
                                  today.getMonth() + 1,
                                ).padStart(2, "0");
                                const dd = String(today.getDate()).padStart(
                                  2,
                                  "0",
                                );
                                setBlockedDateFilter(`${yyyy}-${mm}-${dd}`);
                              }}
                              className={`px-2 py-1 rounded text-[8px] font-bold border transition shrink-0 ${
                                blockedDateFilter ===
                                (() => {
                                  const today = new Date();
                                  const yyyy = today.getFullYear();
                                  const mm = String(
                                    today.getMonth() + 1,
                                  ).padStart(2, "0");
                                  const dd = String(today.getDate()).padStart(
                                    2,
                                    "0",
                                  );
                                  return `${yyyy}-${mm}-${dd}`;
                                })()
                                  ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              আজকে ব্লকড
                            </button>

                            <button
                              onClick={() => {
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                const yyyy = yesterday.getFullYear();
                                const mm = String(
                                  yesterday.getMonth() + 1,
                                ).padStart(2, "0");
                                const dd = String(yesterday.getDate()).padStart(
                                  2,
                                  "0",
                                );
                                setBlockedDateFilter(`${yyyy}-${mm}-${dd}`);
                              }}
                              className={`px-2 py-1 rounded text-[8px] font-bold border transition shrink-0 ${
                                blockedDateFilter ===
                                (() => {
                                  const yesterday = new Date();
                                  yesterday.setDate(yesterday.getDate() - 1);
                                  const yyyy = yesterday.getFullYear();
                                  const mm = String(
                                    yesterday.getMonth() + 1,
                                  ).padStart(2, "0");
                                  const dd = String(
                                    yesterday.getDate(),
                                  ).padStart(2, "0");
                                  return `${yyyy}-${mm}-${dd}`;
                                })()
                                  ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              গতকালকে
                            </button>
                          </div>

                          {(blockedDateFilter || blockedSearchQuery) && (
                            <button
                              onClick={() => {
                                setBlockedDateFilter("");
                                setBlockedSearchQuery("");
                              }}
                              className="text-[8px] font-black text-rose-600 hover:underline flex items-center gap-0.5 cursor-pointer bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md"
                            >
                              ফিল্টার সাফ করুন
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {filteredBlockedList.length === 0 ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                            <p className="text-[10px] text-slate-400 italic font-medium">
                              কোনো ব্লকড ইউজার পাওয়া যায়নি।
                            </p>
                            {(blockedDateFilter || blockedSearchQuery) && (
                              <button
                                onClick={() => {
                                  setBlockedDateFilter("");
                                  setBlockedSearchQuery("");
                                }}
                                className="mt-2 text-[10px] bg-white border border-slate-200 px-3 py-1 rounded-md text-amber-600 font-bold hover:bg-slate-50 cursor-pointer shadow-sm transition"
                              >
                                রিসেট ফিল্টার
                              </button>
                            )}
                          </div>
                        ) : (
                          filteredBlockedList.map((b) => (
                            <div
                              key={b.key}
                              className="bg-white border-2 border-rose-200 hover:border-rose-300 rounded-2xl p-3.5 shadow-sm space-y-2.5 transition relative overflow-hidden"
                            >
                              {/* Red top bar accent */}
                              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 via-red-500 to-rose-600"></div>

                              {/* Top Row: User Name & User Type Badge */}
                              <div className="flex items-start justify-between gap-2 pt-1">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-black text-xs shrink-0 shadow-xs border border-rose-200">
                                    <Ban className="h-4 w-4 text-rose-600" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-black text-slate-900 leading-tight">
                                      {b.name}
                                    </h4>
                                    <span className="text-[9.5px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.2 rounded-md inline-block mt-0.5">
                                      ⛔ {b.userType} - স্থায়ী ব্লকড
                                    </span>
                                  </div>
                                </div>

                                {/* UNBLOCK BUTTON */}
                                <button
                                  onClick={() => handleUnblockUser(b.ip, b.deviceId, b.uid)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-[10px] transition cursor-pointer shadow-sm flex items-center gap-1 active:scale-95 shrink-0"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  <span>আনব্লক করুন</span>
                                </button>
                              </div>

                              {/* Middle Info Box: IP, UID, Device & Time */}
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5 text-[10.5px]">
                                {/* IP Address */}
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500 font-bold text-[10px]">আইপি ঠিকানা (IP):</span>
                                  <span className="font-mono font-extrabold text-slate-900 bg-amber-100/80 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-md text-[10.5px]">
                                    {b.ip}
                                  </span>
                                </div>

                                {/* UID */}
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500 font-bold text-[10px]">ইউআইডি (UID):</span>
                                  <span className="font-mono font-extrabold text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded-md text-[10px]">
                                    {b.uid}
                                  </span>
                                </div>

                                {/* Device Info */}
                                {b.deviceDetails && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500 font-bold text-[10px]">ডিভাইস মডেল:</span>
                                    <span className="font-bold text-slate-700 flex items-center gap-1 text-[10px]">
                                      {b.deviceDetails.iconType === "phone" && <Smartphone className="h-3 w-3 text-slate-500" />}
                                      {b.deviceDetails.iconType === "tablet" && <Tablet className="h-3 w-3 text-slate-500" />}
                                      {b.deviceDetails.iconType === "laptop" && <Laptop className="h-3 w-3 text-slate-500" />}
                                      {b.deviceDetails.iconType === "monitor" && <Monitor className="h-3 w-3 text-slate-500" />}
                                      <span>{b.deviceDetails.name}</span>
                                    </span>
                                  </div>
                                )}

                                {/* Blocked Timestamp */}
                                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                                  <span className="text-slate-500 font-bold text-[10px] flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-amber-600" />
                                    ব্লক করার সময়:
                                  </span>
                                  <span className="font-bold text-slate-900 text-[10px] bg-slate-200/70 px-2 py-0.5 rounded-md">
                                    {formatBlockTime(b.blockedAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}

              {/* --- TAB 5: SETTINGS --- */}
              {activeTab === "settings" && (

                <div className="space-y-4">
                  {/* Preferences config */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-slate-900 uppercase">
                      নিরাপত্তা ও অন্যান্য সেটিংস
                    </h3>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="max-w-[200px]">
                        <p className="text-[10px] font-black text-slate-800">
                          একই আইপি একাধিক জয়েন প্রতিরোধ
                        </p>
                        <p className="text-[9px] text-slate-500 leading-none mt-0.5">
                          একবার জয়েন করা আইপি দিয়ে পুনরায় জয়েন বন্ধ রাখতে এটি
                          সবসময় চালু রাখুন।
                        </p>
                      </div>
                      <button
                        onClick={toggleRepeatJoinsSetting}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          preventRepeatJoins ? "bg-amber-500" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            preventRepeatJoins
                              ? "translate-x-5"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="max-w-[200px]">
                        <p className="text-[10px] font-black text-slate-800">
                          পাবলিক লিংক সচল রাখুন
                        </p>
                        <p className="text-[9px] text-slate-500 leading-relaxed mt-0.5">
                          অন থাকলে সাধারণ লিঙ্কে ক্লিক করে জয়েন সচল থাকবে। অফ
                          করে দিলে টাইম আউট বার্তা দেখানো হবে।
                        </p>
                      </div>
                      <button
                        onClick={togglePublicLinkActiveSetting}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          publicLinkActive ? "bg-amber-500" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            publicLinkActive ? "translate-x-5" : "translate-x-0"
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
                      <p
                        className={`p-2.5 rounded-lg border text-[10px] font-bold ${
                          noticeMessage.type === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-red-50 border-red-200 text-red-800"
                        }`}
                      >
                        {noticeMessage.text}
                      </p>
                    )}

                    <form onSubmit={handleUpdateNotice} className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="max-w-[200px]">
                          <p className="text-[10px] font-black text-slate-800">
                            নোটিশ প্রদর্শন স্ট্যাটাস
                          </p>
                          <p className="text-[9px] text-slate-500 leading-none mt-0.5">
                            শিক্ষার্থীদের জয়েন ফর্মে স্ক্রলিং নোটিশ বার দেখাতে
                            এটি চালু রাখুন।
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNoticeActive(!noticeActive)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            noticeActive ? "bg-amber-500" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              noticeActive ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 block">
                          নোটিশ বার্তা (বাংলায় লিখুন)
                        </label>
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
                        {isUpdatingNotice
                          ? "সংরক্ষণ করা হচ্ছে..."
                          : "নোটিশ সেটিংস আপডেট করুন"}
                      </button>
                    </form>
                  </div>

                  {/* Demo Mode settings system */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 font-sans">
                    <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      ডেমো মোড সেটিংস
                    </h3>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="max-w-[200px]">
                        <p className="text-[10px] font-black text-slate-800">
                          ডেমো মোড সক্রিয় করুন
                        </p>
                        <p className="text-[9px] text-slate-500 leading-normal mt-0.5 animate-pulse">
                          চালু থাকলে সেশন লাইভ পোর্টাল পিলটি রিঅ্যাক্টিভ হবে এবং
                          ৪ ডিজিটের সিক্রেট কোড দিয়ে মিটিংয়ে জয়েন করা যাবে।
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleDemoMode}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          demoModeActive
                            ? "bg-emerald-550 bg-emerald-500"
                            : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            demoModeActive ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {demoModeActive && (
                      <div className="space-y-3 pt-3 border-t border-dashed border-slate-205 border-slate-200">
                        {demoCodeMessage && (
                          <p
                            className={`p-2 rounded-lg border text-[10px] font-bold ${
                              demoCodeMessage.type === "success"
                                ? "bg-emerald-50 border-emerald-250 text-emerald-800"
                                : "bg-red-50 border-red-250 text-red-800"
                            }`}
                          >
                            {demoCodeMessage.text}
                          </p>
                        )}

                        <form
                          onSubmit={handleUpdateDemoCode}
                          className="space-y-3"
                        >
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 block">
                              ডেমো এক্সেস কোড (৪ সংখ্যার সংখ্যা)
                            </label>
                            <input
                              type="text"
                              maxLength={4}
                              pattern="[0-9]{4}"
                              required
                              placeholder="যেমন: ১২৩৪"
                              value={demoCode}
                              onChange={(e) =>
                                setDemoCode(e.target.value.replace(/\D/g, ""))
                              }
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <p className="text-[8px] text-slate-400">
                              এই ৪ সংখ্যার সিক্রেট কোডটি দিয়ে সাধারণ
                              ব্যবহারকারীরা ডেমো মোডে জয়েন করবে।
                            </p>
                          </div>

                          <button
                            type="submit"
                            disabled={isUpdatingDemoCode}
                            className="w-full py-2 bg-[#0f172a] text-emerald-400 font-bold text-[10px] rounded-lg hover:bg-slate-850 transition cursor-pointer"
                          >
                            {isUpdatingDemoCode
                              ? "সংরক্ষণ করা হচ্ছে..."
                              : "ডেমো কোড আপডেট করুন"}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Password modifier */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-slate-900 uppercase">
                      পাসওয়ার্ড পরিবর্তন করুন
                    </h3>

                    {pwdMessage && (
                      <p
                        className={`p-2.5 rounded-lg border text-[10px] font-bold ${
                          pwdMessage.type === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-red-50 border-red-200 text-red-800"
                        }`}
                      >
                        {pwdMessage.text}
                      </p>
                    )}

                    <form onSubmit={handleChangePassword} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-650 text-slate-600 block">
                          নতুন অ্যাডমিন পাসওয়ার্ড
                        </label>
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
                        <label className="text-[10px] font-bold text-slate-650 text-slate-600 block">
                          পাসওয়ার্ড পুনরায় টাইপ করুন
                        </label>
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
                        {isUpdatingPwd
                          ? "আপডেট করা হচ্ছে..."
                          : "নতুন পাসওয়ার্ড সেভ করুন"}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>

            {/* --- BOTTOM MOBILE & DESKTOP APP NAV BAR --- */}
            <nav className="h-16 bg-white border-t border-slate-200 flex justify-around items-center shrink-0 shadow-lg px-2 sm:px-6 select-none select-text">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl cursor-pointer transition ${
                  activeTab === "dashboard"
                    ? "text-amber-600 bg-amber-50 font-extrabold"
                    : "text-slate-500 hover:text-slate-800 font-semibold"
                }`}
              >
                <LayoutDashboard className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] sm:text-xs">ড্যাশবোর্ড</span>
              </button>

              <button
                onClick={() => setActiveTab("meeting")}
                className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl cursor-pointer transition ${
                  activeTab === "meeting"
                    ? "text-amber-600 bg-amber-50 font-extrabold"
                    : "text-slate-500 hover:text-slate-800 font-semibold"
                }`}
              >
                <LinkIcon className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] sm:text-xs">লিংক তৈরি</span>
              </button>

              <button
                onClick={() => setActiveTab("data")}
                className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl cursor-pointer transition relative ${
                  activeTab === "data"
                    ? "text-amber-600 bg-amber-50 font-extrabold"
                    : "text-slate-500 hover:text-slate-800 font-semibold"
                }`}
              >
                <Users className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] sm:text-xs">ইউজার লগ</span>
                {displayUserCount > 0 && (
                  <span className="absolute -top-1 -right-0.5 px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold rounded-full text-[9px] shadow-xs">
                    {displayUserCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("demo")}
                className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl cursor-pointer transition relative ${
                  activeTab === "demo"
                    ? "text-amber-600 bg-amber-50 font-extrabold"
                    : "text-slate-500 hover:text-slate-800 font-semibold"
                }`}
              >
                <UserCheck className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] sm:text-xs">ডেমো লগ</span>
                {displayDemoCount > 0 && (
                  <span className="absolute -top-1 -right-0.5 px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold rounded-full text-[9px] shadow-xs">
                    {displayDemoCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("blocked")}
                className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl cursor-pointer transition relative ${
                  activeTab === "blocked"
                    ? "text-amber-600 bg-amber-50 font-extrabold"
                    : "text-slate-500 hover:text-slate-800 font-semibold"
                }`}
              >
                <Ban className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] sm:text-xs">ব্লকলিস্ট</span>
                {blockedIPs.length > 0 && (
                  <span className="absolute -top-1 -right-0.5 px-1.5 py-0.2 bg-rose-500 text-white font-bold rounded-full text-[9px] shadow-xs">
                    {blockedIPs.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("settings")}
                className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl cursor-pointer transition ${
                  activeTab === "settings"
                    ? "text-amber-600 bg-amber-50 font-extrabold"
                    : "text-slate-500 hover:text-slate-800 font-semibold"
                }`}
              >
                <SettingsIcon className="h-5 w-5 mb-0.5" />
                <span className="text-[10px] sm:text-xs">সেটিংস</span>
              </button>
            </nav>

            {/* SUPABASE SQL & INSTRUCTIONS MODAL */}
            {showSupabaseModal && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-slate-900 border-2 border-emerald-500 rounded-2xl max-w-lg w-full p-5 text-white space-y-4 max-h-[85vh] flex flex-col shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></div>
                      <h3 className="text-sm font-black text-emerald-400">
                        Supabase ডাটাবেজ ইন্টিগ্রেশন
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowSupabaseModal(false)}
                      className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 overflow-y-auto text-[11px] text-slate-300 pr-1">
                    <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3 space-y-1 text-emerald-200">
                      <p className="font-bold">✅ প্রজেক্ট ইউআরএল ও কি সফলভাবে সেট হয়েছে:</p>
                      <p className="text-[10px] font-mono break-all text-emerald-300">{SUPABASE_URL}</p>
                    </div>

                    <p className="leading-relaxed">
                      যদি আপনি Supabase এ টেবিলগুলো এখনও তৈরি না করে থাকেন, তবে নিচের SQL স্ক্রিপ্টটি কপি করে আপনার Supabase ড্যাশবোর্ডের <strong>SQL Editor</strong>-এ পেস্ট করে <strong>Run</strong> করুন। মাত্র ৫ সেকেন্ডে সব টেবিল তৈরি হয়ে যাবে।
                    </p>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">Supabase SQL স্ক্রিপ্ট:</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                            setCopiedSql(true);
                            setTimeout(() => setCopiedSql(false), 2000);
                          }}
                          className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-[10px] transition cursor-pointer flex items-center gap-1"
                        >
                          {copiedSql ? "✓ কপি হয়েছে!" : "📋 SQL কোড কপি করুন"}
                        </button>
                      </div>
                      <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-48 custom-scrollbar">
                        {SUPABASE_SETUP_SQL}
                      </pre>
                    </div>

                    <div className="bg-slate-800/80 rounded-xl p-3 space-y-1.5 border border-slate-700">
                      <p className="font-bold text-amber-300">💡 ধাপসমূহ:</p>
                      <ol className="list-decimal pl-4 space-y-1 text-[10px] text-slate-300">
                        <li>উপরে <strong>"SQL কোড কপি করুন"</strong> বাটনে চাপ দিন।</li>
                        <li>
                          <a
                            href="https://supabase.com/dashboard"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 underline"
                          >
                            Supabase Dashboard ↗
                          </a>
                          -এ গিয়ে বাম পাশের মেনু থেকে <strong>SQL Editor</strong>-এ যান।
                        </li>
                        <li>নতুন কুয়েরি খুলে কপি করা কোড পেস্ট করে <strong>Run</strong> বাটনে চাপুন।</li>
                      </ol>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => setShowSupabaseModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      বন্ধ করুন
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
