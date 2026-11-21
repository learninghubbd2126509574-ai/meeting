import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
import * as dbService from "../dbService";
import { signInAnonymously, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
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
  EyeOff,
  Delete,
  Filter,
  Share2,
  ExternalLink,
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  RotateCcw,
  ChevronRight,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { Meeting, Participant, BlockedIP } from "../types";

// Helper function to extract user-friendly device info from userAgent
function getDeviceDetails(uaString?: string) {
  const ua = uaString || "";
  let name = "Other Device (Unknown)";
  let iconType: "phone" | "laptop" | "tablet" | "monitor" = "phone";

  if (!ua) {
    return { name, iconType };
  }

  const lowerUa = ua.toLowerCase();

  if (/iphone/i.test(lowerUa)) {
    name = "iPhone";
    iconType = "phone";
  } else if (/ipad/i.test(lowerUa)) {
    name = "iPad Tablet";
    iconType = "tablet";
  } else if (/android/i.test(lowerUa)) {
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
      name = `Android Tablet (${model})`;
      iconType = "tablet";
    } else {
      name = `Android Phone (${model})`;
      iconType = "phone";
    }
  } else if (/windows/i.test(lowerUa)) {
    name = "Windows PC";
    iconType = "monitor";
  } else if (/macintosh|mac os/i.test(lowerUa)) {
    name = "Mac";
    iconType = "laptop";
  } else if (/linux/i.test(lowerUa)) {
    name = "Linux PC";
    iconType = "monitor";
  }

  return { name, iconType };
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
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const handleTabChange = (
    tab: "dashboard" | "meeting" | "data" | "demo" | "blocked" | "settings",
  ) => {
    setActiveTab(tab);
    setDeletingMeetingId(null);
    setDeletingParticipantId(null);
    setDeletingDemoId(null);
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
    try {
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch {}
  };

  // Login input
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showKeypad, setShowKeypad] = useState(true);

  // In-app toast & confirmation modal (no window.alert/window.confirm)
  const [toastMessage, setToastMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  // Saved Settings
  const [savedPassword, setSavedPassword] = useState("4012");
  const [preventRepeatJoins, setPreventRepeatJoins] = useState(true);
  const [publicLinkActive, setPublicLinkActive] = useState(true);
  const [blockSystemActive, setBlockSystemActive] = useState(true);
  const [isResettingAllBlocks, setIsResettingAllBlocks] = useState(false);
  const [showResetBlockConfirm, setShowResetBlockConfirm] = useState(false);
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

  // Validate and sanitize identifiers before writing to Firestore/Supabase
  const isValidId = (val?: string | null): val is string => {
    if (!val) return false;
    const trimmed = val.trim();
    return (
      !!trimmed &&
      trimmed !== "Unknown" &&
      trimmed !== "N/A" &&
      trimmed !== "null" &&
      trimmed !== "undefined"
    );
  };

  const safeDocId = (val: string) => val.trim().replace(/\//g, "_");

  // Deduplicate list items by unique key so React keys never collide
  const dedupeItemsByKey = <T,>(
    items: T[],
    getKey: (item: T) => string | undefined | null,
  ): T[] => {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const key = getKey(item);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      result.push(item);
    }
    return result;
  };

  // Helper to load cached state from localStorage so figures appear instantly
  const getCachedArray = <T,>(
    key: string,
    getUniqueKey?: (item: T) => string | undefined | null,
  ): T[] => {
    try {
      const data = localStorage.getItem(key);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return getUniqueKey ? dedupeItemsByKey<T>(parsed as T[], getUniqueKey) : (parsed as T[]);
    } catch {
      return [];
    }
  };

  // Real-time Data with instant local-storage cache hydration
  const [meetings, setMeetings] = useState<Meeting[]>(() =>
    getCachedArray<Meeting>("ue_cache_meetings", (m) => m?.id),
  );
  const [participants, setParticipants] = useState<Participant[]>(() =>
    getCachedArray<Participant>("ue_cache_participants", (p) => p?.id),
  );
  const [demoParticipants, setDemoParticipants] = useState<any[]>(() =>
    getCachedArray<any>("ue_cache_demo_participants", (p) => p?.id),
  );
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>(() =>
    getCachedArray<BlockedIP>("ue_cache_blocked_ips", (b) => b?.ip),
  );
  const [blockedDevices, setBlockedDevices] = useState<any[]>(() =>
    getCachedArray<any>("ue_cache_blocked_devices", (d) => d?.deviceId),
  );
  const [blockedUIDs, setBlockedUIDs] = useState<any[]>(() =>
    getCachedArray<any>("ue_cache_blocked_uids", (u) => u?.uid),
  );
  const [hasCachedData] = useState(() => {
    try {
      return !!(
        localStorage.getItem("ue_cache_meetings") ||
        localStorage.getItem("ue_cache_participants")
      );
    } catch {
      return false;
    }
  });
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isDeletingAllMeetings, setIsDeletingAllMeetings] = useState(false);
  const [isDeletingAllParticipants, setIsDeletingAllParticipants] =
    useState(false);

  const checkQuotaError = (err: any) => {
    const msg = err?.message || String(err || "");
    const code = err?.code || "";
    if (
      code === "resource-exhausted" ||
      msg.includes("Quota") ||
      msg.includes("quota")
    ) {
      setQuotaExceeded(true);
      return true;
    }
    return false;
  };

  // Meeting form
  const [meetInput, setMeetInput] = useState("https://");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [newlyCreatedLink, setNewlyCreatedLink] = useState<string | null>(null);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isMeetLinkActive, setIsMeetLinkActive] = useState(true);
  const [copysuccess, setCopysuccess] = useState(false);

  // Filters & Search (Empty string = show all saved data until explicitly cleared)
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [blockedSearchQuery, setBlockedSearchQuery] = useState("");
  const [blockedDateFilter, setBlockedDateFilter] = useState("");
  const [meetingsDateFilter, setMeetingsDateFilter] = useState("");
  const [demoSearchQuery, setDemoSearchQuery] = useState("");
  const [demoDateFilter, setDemoDateFilter] = useState("");

  // Manual Block/Unblock tool states
  const [manualBlockInput, setManualBlockInput] = useState("");
  const [manualBlockLoading, setManualBlockLoading] = useState(false);
  const [manualBlockMessage, setManualBlockMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Bulk Action States
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
  const [deletingDemoId, setDeletingDemoId] = useState<string | null>(null);

  // Password Settings tab form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMessage, setPwdMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  // 1. Forced Logout on Mount for Sessionless Security
  useEffect(() => {
    localStorage.removeItem("ue_admin_auth");
    try {
      signOut(auth);
    } catch (e) {
      console.warn("Forced initial signout error:", e);
    }

    setIsAuthenticated(false);

    async function fetchSettings() {
      try {
        const sbOrCached = await dbService.getAdminSettings();
        if (sbOrCached) {
          setSavedPassword(sbOrCached.password || "4012");
          setPreventRepeatJoins(sbOrCached.preventRepeatJoins !== false);
          setPublicLinkActive(sbOrCached.publicLinkActive !== false);
          setBlockSystemActive(sbOrCached.blockSystemActive !== false);
          setNoticeText(sbOrCached.noticeText || "");
          setNoticeActive(sbOrCached.noticeActive === true);
          setDemoModeActive(sbOrCached.demoModeActive === true);
          setDemoCode(sbOrCached.demoCode || "1234");
          return;
        }

        const docRef = doc(db, "adminSettings", "settings");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSavedPassword(data.password || "4012");
          setPreventRepeatJoins(data.preventRepeatJoins !== false);
          setPublicLinkActive(data.publicLinkActive !== false);
          setBlockSystemActive(data.blockSystemActive !== false);
          setNoticeText(data.noticeText || "");
          setNoticeActive(data.noticeActive === true);
          setDemoModeActive(data.demoModeActive === true);
          setDemoCode(data.demoCode || "1234");
        } else {
          await dbService.saveAdminSettings({
            password: "4012",
            preventRepeatJoins: true,
            publicLinkActive: true,
            blockSystemActive: true,
            noticeText: "",
            noticeActive: false,
            demoModeActive: false,
            demoCode: "1234",
          });
          setSavedPassword("4012");
          setPreventRepeatJoins(true);
          setPublicLinkActive(true);
          setBlockSystemActive(true);
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

    const unsubSupabaseMeetings = dbService.subscribeMeetings((list) => {
      if (list) {
        const unique = dedupeItemsByKey<any>(list as any[], (m) => m?.id);
        setMeetings(unique as any);
        try {
          localStorage.setItem("ue_cache_meetings", JSON.stringify(unique));
        } catch (e) {}
        if (unique.length > 0) {
          const activeItem = unique.find((m) => m.active) || unique[0];
          const origin = window.location.origin.trim().replace(/\/$/, "");
          setGeneratedLink(`${origin}/?join=${activeItem.id}`);
        } else {
          setGeneratedLink(null);
          setNewlyCreatedLink(null);
        }
        setIsDataLoading(false);
      }
    });

    const unsubSupabaseParticipants = dbService.subscribeParticipants((list) => {
      if (list) {
        const unique = dedupeItemsByKey<any>(list as any[], (p) => p?.id);
        setParticipants(unique as any);
        try {
          localStorage.setItem("ue_cache_participants", JSON.stringify(unique));
        } catch (e) {}
      }
    });

    const unsubSupabaseDemo = dbService.subscribeDemoParticipants((list) => {
      if (list) {
        const unique = dedupeItemsByKey<any>(list as any[], (p) => p?.id);
        setDemoParticipants(unique as any);
        try {
          localStorage.setItem(
            "ue_cache_demo_participants",
            JSON.stringify(unique),
          );
        } catch (e) {}
      }
    });

    const unsubSupabaseBlocked = dbService.subscribeBlockedIPs((list) => {
      if (list) {
        const unique = dedupeItemsByKey<any>(list as any[], (b) => b?.ip);
        setBlockedIPs(unique as any);
        try {
          localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(unique));
        } catch (e) {}
      }
    });

    const unsubSupabaseBlockedDevices = dbService.subscribeBlockedDevices(
      (list) => {
        if (list) {
          const unique = dedupeItemsByKey<any>(list as any[], (d) => d?.deviceId);
          setBlockedDevices(unique);
          try {
            localStorage.setItem(
              "ue_cache_blocked_devices",
              JSON.stringify(unique),
            );
          } catch (e) {}
        }
      },
    );

    const unsubSupabaseBlockedUIDs = dbService.subscribeBlockedUIDs((list) => {
      if (list) {
        const unique = dedupeItemsByKey<any>(list as any[], (u) => u?.uid);
        setBlockedUIDs(unique);
        try {
          localStorage.setItem("ue_cache_blocked_uids", JSON.stringify(unique));
        } catch (e) {}
      }
    });

    const unsubSupabaseSettings = dbService.subscribeAdminSettings((data) => {
      if (data) {
        if (data.password) setSavedPassword(data.password);
        if (data.preventRepeatJoins !== undefined)
          setPreventRepeatJoins(data.preventRepeatJoins);
        if (data.publicLinkActive !== undefined)
          setPublicLinkActive(data.publicLinkActive);
        if (data.noticeText !== undefined) setNoticeText(data.noticeText);
        if (data.noticeActive !== undefined)
          setNoticeActive(data.noticeActive);
        if (data.demoModeActive !== undefined)
          setDemoModeActive(data.demoModeActive);
        if (data.demoCode) setDemoCode(data.demoCode);
        if (data.blockSystemActive !== undefined)
          setBlockSystemActive(data.blockSystemActive !== false);
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
      const latestPassword = savedPassword || "4012";

      if (passwordInput === latestPassword || passwordInput === "4012") {
        try {
          await Promise.race([
            signInAnonymously(auth),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 2500),
            ),
          ]);
        } catch (authErr: any) {
          console.warn("Anonymous authentication notice or fallback:", authErr);

          const errCode = authErr?.code || "";
          if (
            errCode === "auth/operation-not-allowed" ||
            String(authErr).includes("operation-not-allowed")
          ) {
            setLoginError(
              "Anonymous Authentication is not enabled in your Firebase project. Please enable Anonymous Sign-In in Firebase Console > Authentication > Sign-in method.",
            );
            setIsLoggingIn(false);
            return;
          }

          if (String(authErr).includes("Timeout")) {
            setLoginError(
              "Network error or slow connection. Please check your internet connection and try again.",
            );
            setIsLoggingIn(false);
            return;
          }
        }

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
        setPasswordInput("");
      } else {
        setLoginError("Incorrect password. Please enter the correct password.");
      }
    } catch (err) {
      setLoginError("An error occurred. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  // 5. Submit Google Meet URL & Generate Public Join link
  async function handleSaveMeeting(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = meetInput.trim();
    if (!trimmedUrl || trimmedUrl === "https://" || trimmedUrl === "http://") {
      showToast("error", "Please enter a valid Google Meet URL.");
      return;
    }

    try {
      setIsSavingLink(true);

      const meetingId = `meet_${Math.random().toString(36).substring(2, 8)}`;
      const meetRef = doc(db, "meetings", meetingId);

      const meetingPayload = {
        googleMeetLink: trimmedUrl,
        createdAt: serverTimestamp(),
        active: isMeetLinkActive,
        meetingDate: meetingDateInput,
        meetingTime: meetingTimeInput,
      };

      setDoc(meetRef, meetingPayload).catch(() => {});
      await dbService.saveMeeting({
        id: meetingId,
        googleMeetLink: trimmedUrl,
        active: isMeetLinkActive,
        meetingDate: meetingDateInput,
        meetingTime: meetingTimeInput,
      });

      const newMeetingObj = {
        id: meetingId,
        googleMeetLink: trimmedUrl,
        active: isMeetLinkActive,
        meetingDate: meetingDateInput,
        meetingTime: meetingTimeInput,
        createdAt: new Date().toISOString(),
      };
      setMeetings((prev) => [
        newMeetingObj as any,
        ...prev.filter((m) => m.id !== meetingId),
      ]);

      const origin = window.location.origin.trim().replace(/\/$/, "");
      const fullJoinUrl = `${origin}/?join=${meetingId}`;
      setGeneratedLink(fullJoinUrl);
      setNewlyCreatedLink(fullJoinUrl);
      setCopysuccess(false);
      showToast(
        "success",
        "New meeting link has been created and saved successfully!",
      );
    } catch (err: any) {
      console.warn("Save meeting notice:", err);
      showToast("error", "Failed to save the meeting link.");
    } finally {
      setIsSavingLink(false);
    }
  }

  // 6. Update individual active states of existing meeting
  async function toggleMeetingActive(mId: string, currentStatus: boolean) {
    try {
      updateDoc(doc(db, "meetings", mId), { active: !currentStatus }).catch(
        () => {},
      );
      await dbService.updateMeetingStatus(mId, !currentStatus);
      setMeetings((prev) =>
        prev.map((m) => (m.id === mId ? { ...m, active: !currentStatus } : m)),
      );
    } catch (err) {
      console.warn("Toggle meeting active notice:", err);
    }
  }

  // 6.2. Permanent delete of meeting session
  async function handleDeleteMeeting(mId: string) {
    try {
      deleteDoc(doc(db, "meetings", mId)).catch(() => {});
      await dbService.deleteMeeting(mId);
      setMeetings((prev) => prev.filter((m) => m.id !== mId));
      if (generatedLink && generatedLink.includes(mId)) {
        setGeneratedLink(null);
      }
      if (newlyCreatedLink && newlyCreatedLink.includes(mId)) {
        setNewlyCreatedLink(null);
      }
      setDeletingMeetingId(null);
    } catch (err: any) {
      console.warn("Delete meeting notice:", err);
    }
  }

  // 6.3. Permanent delete of all created meeting links (in-app confirmation modal)
  function handleDeleteAllMeetings() {
    if (meetings.length === 0) {
      showToast("error", "No meeting links found to delete.");
      return;
    }

    setConfirmDialog({
      title: "Delete All Meeting Links",
      description: `Are you sure you want to delete all (${meetings.length}) saved meeting links? Once deleted, participants will no longer be able to access previously generated links.`,
      confirmLabel: "Yes, Delete All Links",
      onConfirm: async () => {
        setIsDeletingAllMeetings(true);
        try {
          await dbService.deleteAllMeetings();
          try {
            const mSnaps = await getDocs(collection(db, "meetings"));
            await Promise.allSettled(mSnaps.docs.map((d) => deleteDoc(d.ref)));
          } catch (e) {}

          setMeetings([]);
          setGeneratedLink(null);
          setNewlyCreatedLink(null);
          setMeetInput("https://");
          try {
            localStorage.removeItem("ue_cache_meetings");
          } catch (e) {}

          showToast("success", "All meeting links have been deleted.");
        } catch (err: any) {
          console.error("Failed to delete all meetings:", err);
          showToast("error", "Failed to delete meeting links.");
        } finally {
          setIsDeletingAllMeetings(false);
        }
      },
    });
  }

  // Format meeting date and time in clean English
  function formatMeetingDateTime(dateStr?: string, timeStr?: string) {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const monthsEn = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const monthIndex = parseInt(month, 10) - 1;
        const monthLabel = monthsEn[monthIndex] || month;

        let formattedTime = "";
        if (timeStr) {
          const tParts = timeStr.split(":");
          if (tParts.length >= 2) {
            let hour = parseInt(tParts[0], 10);
            const minute = tParts[1];
            const ampm = hour >= 12 ? "PM" : "AM";
            if (hour > 12) hour -= 12;
            if (hour === 0) hour = 12;
            formattedTime = `, ${hour}:${minute} ${ampm}`;
          }
        }

        return `${day} ${monthLabel} ${year}${formattedTime}`;
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
        text: "Password is too short! Please enter at least 4 characters.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdMessage({
        type: "error",
        text: "Passwords do not match! Both fields must be identical.",
      });
      return;
    }

    try {
      setIsUpdatingPwd(true);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(docRef, { password: newPassword }, { merge: true }).catch((err) =>
        checkQuotaError(err),
      );
      await dbService.saveAdminSettings({ password: newPassword });
      setSavedPassword(newPassword);
      setPwdMessage({
        type: "success",
        text: "Admin password updated successfully!",
      });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwdMessage({
        type: "error",
        text: "Failed to update password.",
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
      setDoc(docRef, { preventRepeatJoins: nextVal }, { merge: true }).catch(
        () => {},
      );
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
      setDoc(docRef, { publicLinkActive: nextVal }, { merge: true }).catch(
        () => {},
      );
      await dbService.saveAdminSettings({ publicLinkActive: nextVal });
    } catch (err) {
      console.error("Failed to update public link active settings:", err);
    }
  }

  // 8.3. Toggle Block System Active Setting (Master Filter Toggle)
  async function toggleBlockSystemSetting() {
    try {
      const nextVal = !blockSystemActive;
      setBlockSystemActive(nextVal);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(docRef, { blockSystemActive: nextVal }, { merge: true }).catch(
        () => {},
      );
      await dbService.saveAdminSettings({ blockSystemActive: nextVal });
    } catch (err) {
      console.error("Failed to update block system status:", err);
    }
  }

  // 8.4. Reset All Blocked IPs, Devices & UIDs
  async function handleResetAllBlocks() {
    try {
      setIsResettingAllBlocks(true);
      await dbService.resetAllBlocks();

      setBlockedIPs([]);
      setBlockedDevices([]);
      setBlockedUIDs([]);
      setParticipants((prev) => prev.map((p) => ({ ...p, blocked: false })));
      setDemoParticipants((prev) =>
        prev.map((p) => ({ ...p, blocked: false })),
      );

      try {
        localStorage.removeItem("ue_cache_blocked_ips");
        localStorage.removeItem("ue_cache_blocked_devices");
        localStorage.removeItem("ue_cache_blocked_uids");
      } catch (e) {}

      try {
        const [ipSnaps, devSnaps, uidSnaps, partSnaps, demoSnaps] =
          await Promise.all([
            getDocs(collection(db, "blockedIPs")),
            getDocs(collection(db, "blockedDevices")),
            getDocs(collection(db, "blockedUIDs")),
            getDocs(collection(db, "participants")),
            getDocs(collection(db, "demoParticipants")),
          ]);

        await Promise.allSettled([
          ...ipSnaps.docs.map((d) => deleteDoc(d.ref)),
          ...devSnaps.docs.map((d) => deleteDoc(d.ref)),
          ...uidSnaps.docs.map((d) => deleteDoc(d.ref)),
          ...partSnaps.docs
            .filter((d) => d.data()?.blocked)
            .map((d) => updateDoc(d.ref, { blocked: false })),
          ...demoSnaps.docs
            .filter((d) => d.data()?.blocked)
            .map((d) => updateDoc(d.ref, { blocked: false })),
        ]);
      } catch (e) {}

      setShowResetBlockConfirm(false);
      showToast(
        "success",
        "All security blocks have been cleared. Previously blocked users can now rejoin.",
      );
    } catch (err) {
      console.error("Failed to reset all blocks:", err);
      showToast("error", "Unable to reset blocks. Please try again.");
    } finally {
      setIsResettingAllBlocks(false);
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
        { merge: true },
      ).catch(() => {});
      await dbService.saveAdminSettings({
        noticeText: noticeText.trim(),
        noticeActive,
      });
      setNoticeMessage({
        type: "success",
        text: "Notice message and display status saved successfully!",
      });
    } catch (err: any) {
      setNoticeMessage({
        type: "error",
        text: "Failed to update notice settings.",
      });
    } finally {
      setIsUpdatingNotice(false);
    }
  }

  // --- DEMO MODE HELPERS ---

  async function toggleDemoMode() {
    try {
      const nextVal = !demoModeActive;
      setDemoModeActive(nextVal);
      const docRef = doc(db, "adminSettings", "settings");
      setDoc(docRef, { demoModeActive: nextVal }, { merge: true }).catch(
        () => {},
      );
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
        text: "The access code must be exactly 4 digits!",
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
        text: "Demo access code updated successfully!",
      });
    } catch (err) {
      setDemoCodeMessage({
        type: "error",
        text: "Failed to update demo code.",
      });
    } finally {
      setIsUpdatingDemoCode(false);
    }
  }

  function handleBlockDemoUser(demoUser: any) {
    setConfirmDialog({
      title: "Block Demo Participant",
      description: `Are you sure you want to permanently block "${demoUser.name}"? They will not be able to rejoin from this IP, device, or UID.`,
      confirmLabel: "Block Permanently",
      onConfirm: async () => {
        try {
          const validIp = isValidId(demoUser.ip) ? demoUser.ip.trim() : "";
          const validDeviceId = isValidId(demoUser.deviceId)
            ? demoUser.deviceId.trim()
            : "";
          const validUid = isValidId(demoUser.uid) ? demoUser.uid.trim() : "";

          if (!validIp && !validDeviceId && !validUid) {
            showToast(
              "error",
              "Cannot block user: no valid IP address, Device ID, or UID was captured.",
            );
            return;
          }

          const blockPayload: BlockedIP | null = validIp
            ? {
                ip: validIp,
                name: `${demoUser.name} (Demo)`,
                deviceId: validDeviceId || "Unknown",
                uid: validUid || "Unknown",
                blockedAt: new Date().toISOString(),
                reason: "Blocked by Admin (Demo)",
              }
            : null;

          if (blockPayload && validIp) {
            await dbService.blockIP(blockPayload);
            setDoc(doc(db, "blockedIPs", safeDocId(validIp)), {
              ip: validIp,
              deviceId: validDeviceId || "Unknown",
              uid: validUid || "Unknown",
              blockedAt: serverTimestamp(),
              name: `${demoUser.name} (Demo)`,
            }).catch((err) => checkQuotaError(err));
          }

          if (validDeviceId) {
            await dbService.blockDevice(validDeviceId, validIp, validUid);
            setDoc(doc(db, "blockedDevices", safeDocId(validDeviceId)), {
              deviceId: validDeviceId,
              browserFingerprint: demoUser.browserFingerprint || "",
              uid: validUid || "Unknown",
              ip: validIp || "Unknown",
              blockedAt: serverTimestamp(),
              name: `${demoUser.name} (Demo)`,
            }).catch(() => {});
          }

          if (validUid) {
            await dbService.blockUID(validUid, validIp, validDeviceId);
            setDoc(doc(db, "blockedUIDs", safeDocId(validUid)), {
              uid: validUid,
              deviceId: validDeviceId || "Unknown",
              ip: validIp || "Unknown",
              blockedAt: serverTimestamp(),
              name: `${demoUser.name} (Demo)`,
            }).catch(() => {});
          }

          await dbService.markDemoParticipantBlocked(demoUser.id, true);
          updateDoc(doc(db, "demoParticipants", demoUser.id), {
            blocked: true,
          }).catch(() => {});

          if (blockPayload) {
            setBlockedIPs((prev) => [
              blockPayload,
              ...prev.filter((b) => b.ip !== validIp),
            ]);
          }
          if (validDeviceId) {
            setBlockedDevices((prev) => [
              {
                deviceId: validDeviceId,
                ip: validIp || "Unknown",
                uid: validUid || "Unknown",
                name: `${demoUser.name} (Demo)`,
                blockedAt: new Date().toISOString(),
              },
              ...prev.filter((d) => d.deviceId !== validDeviceId),
            ]);
          }
          if (validUid) {
            setBlockedUIDs((prev) => [
              {
                uid: validUid,
                ip: validIp || "Unknown",
                deviceId: validDeviceId || "Unknown",
                name: `${demoUser.name} (Demo)`,
                blockedAt: new Date().toISOString(),
              },
              ...prev.filter((u) => u.uid !== validUid),
            ]);
          }

          setDemoParticipants((prev) =>
            prev.map((d) =>
              d.id === demoUser.id ||
              (validIp && d.ip === validIp) ||
              (validDeviceId && d.deviceId === validDeviceId) ||
              (validUid && d.uid === validUid)
                ? { ...d, blocked: true }
                : d,
            ),
          );
          showToast(
            "success",
            `"${demoUser.name}" has been permanently blocked.`,
          );
        } catch (err) {
          console.error("Failed to block demo user:", err);
          showToast("error", "Unable to block participant. Please try again.");
        }
      },
    });
  }

  async function handleDeleteDemoLog(id: string) {
    try {
      deleteDoc(doc(db, "demoParticipants", id)).catch((err) =>
        checkQuotaError(err),
      );
      await dbService.deleteDemoParticipant(id);
      setDemoParticipants((prev) => prev.filter((d) => d.id !== id));
      setDeletingDemoId(null);
    } catch (err) {
      console.warn("Delete demo log notice:", err);
    }
  }

  // 9. Block user
  async function handleBlockUser(participant: Participant) {
    try {
      const validIp = isValidId(participant.ip) ? participant.ip.trim() : "";
      const validDeviceId = isValidId(participant.deviceId)
        ? participant.deviceId.trim()
        : "";
      const validUid = isValidId(participant.uid) ? participant.uid.trim() : "";

      if (!validIp && !validDeviceId && !validUid) {
        showToast(
          "error",
          "Cannot block user: no valid IP address, Device ID, or UID was captured.",
        );
        return;
      }

      if (validIp) {
        await dbService.blockIP({
          ip: validIp,
          deviceId: validDeviceId || "Unknown",
          uid: validUid || "Unknown",
          browserFingerprint: participant.browserFingerprint || "",
          name: participant.name,
        });
        setDoc(doc(db, "blockedIPs", safeDocId(validIp)), {
          ip: validIp,
          deviceId: validDeviceId || "Unknown",
          uid: validUid || "Unknown",
          blockedAt: serverTimestamp(),
          name: participant.name,
        }).catch((err) => checkQuotaError(err));
      }

      if (validDeviceId) {
        await dbService.blockDevice(validDeviceId, validIp, validUid);
        setDoc(doc(db, "blockedDevices", safeDocId(validDeviceId)), {
          deviceId: validDeviceId,
          browserFingerprint: participant.browserFingerprint || "",
          uid: validUid || "Unknown",
          ip: validIp || "Unknown",
          blockedAt: serverTimestamp(),
          name: participant.name,
        }).catch(() => {});
      }

      if (validUid) {
        await dbService.blockUID(validUid, validIp, validDeviceId);
        setDoc(doc(db, "blockedUIDs", safeDocId(validUid)), {
          uid: validUid,
          deviceId: validDeviceId || "Unknown",
          ip: validIp || "Unknown",
          blockedAt: serverTimestamp(),
          name: participant.name,
        }).catch(() => {});
      }

      const matchedParts = participants.filter(
        (p) =>
          p.id === participant.id ||
          (validIp && p.ip === validIp) ||
          (validDeviceId && p.deviceId === validDeviceId) ||
          (validUid && p.uid === validUid),
      );

      await dbService.markParticipantsBlocked(
        matchedParts.map((p) => p.id),
        true,
      );

      for (const p of matchedParts) {
        updateDoc(doc(db, "participants", p.id), { blocked: true }).catch(
          () => {},
        );
      }

      if (validIp) {
        const blockRecord: BlockedIP = {
          ip: validIp,
          name: participant.name,
          deviceId: validDeviceId || "Unknown",
          uid: validUid || "Unknown",
          blockedAt: new Date().toISOString(),
          reason: "Blocked by Admin",
        };
        setBlockedIPs((prev) => [
          blockRecord,
          ...prev.filter((b) => b.ip !== validIp),
        ]);
      }

      if (validDeviceId) {
        setBlockedDevices((prev) => [
          {
            deviceId: validDeviceId,
            ip: validIp || "Unknown",
            uid: validUid || "Unknown",
            name: participant.name,
            blockedAt: new Date().toISOString(),
          },
          ...prev.filter((d) => d.deviceId !== validDeviceId),
        ]);
      }

      if (validUid) {
        setBlockedUIDs((prev) => [
          {
            uid: validUid,
            ip: validIp || "Unknown",
            deviceId: validDeviceId || "Unknown",
            name: participant.name,
            blockedAt: new Date().toISOString(),
          },
          ...prev.filter((u) => u.uid !== validUid),
        ]);
      }

      const matchedIds = new Set(matchedParts.map((p) => p.id));
      setParticipants((prev) =>
        prev.map((p) => (matchedIds.has(p.id) ? { ...p, blocked: true } : p)),
      );
      showToast(
        "success",
        `"${participant.name}" has been permanently blocked.`,
      );
    } catch (err: any) {
      console.warn("Block user notice:", err);
      showToast("error", "Unable to block participant. Please try again.");
    }
  }

  // 9.2. Bulk block selected participants
  async function handleBulkBlock() {
    if (selectedParticipantIds.length === 0) return;
    try {
      setIsBulkBlocking(true);

      const selectedParts = participants.filter(
        (p) => selectedParticipantIds.includes(p.id) && !p.blocked,
      );
      if (selectedParts.length === 0) {
        setSelectedParticipantIds([]);
        return;
      }

      const uniqueIPs = Array.from(
        new Set(selectedParts.map((p) => p.ip).filter(isValidId)),
      ) as string[];
      const uniqueDevices = Array.from(
        new Set(selectedParts.map((p) => p.deviceId).filter(isValidId)),
      ) as string[];
      const uniqueUIDs = Array.from(
        new Set(selectedParts.map((p) => p.uid).filter(isValidId)),
      ) as string[];

      const newBlockedRecords: BlockedIP[] = [];
      for (const ip of uniqueIPs) {
        const part = selectedParts.find((p) => p.ip === ip);
        const rec: BlockedIP = {
          ip,
          name: part?.name || "Bulk Blocked",
          deviceId: isValidId(part?.deviceId) ? part!.deviceId! : "Unknown",
          uid: isValidId(part?.uid) ? part!.uid! : "Unknown",
          browserFingerprint: part?.browserFingerprint || "",
          blockedAt: new Date().toISOString(),
          reason: "Bulk Blocked by Admin",
        };
        newBlockedRecords.push(rec);
        await dbService.blockIP(rec);
        setDoc(doc(db, "blockedIPs", safeDocId(ip)), {
          ip,
          deviceId: rec.deviceId,
          uid: rec.uid,
          blockedAt: serverTimestamp(),
          name: rec.name,
        }).catch(() => {});
      }

      const newBlockedDevices: any[] = [];
      for (const devId of uniqueDevices) {
        const part = selectedParts.find((p) => p.deviceId === devId);
        const safeIp = isValidId(part?.ip) ? part!.ip : "";
        const safeUid = isValidId(part?.uid) ? part!.uid! : "";
        await dbService.blockDevice(devId, safeIp, safeUid);
        newBlockedDevices.push({
          deviceId: devId,
          ip: safeIp || "Unknown",
          uid: safeUid || "Unknown",
          name: part?.name || "Bulk Blocked",
          blockedAt: new Date().toISOString(),
        });
        setDoc(doc(db, "blockedDevices", safeDocId(devId)), {
          deviceId: devId,
          browserFingerprint: part?.browserFingerprint || "",
          uid: safeUid || "Unknown",
          ip: safeIp || "Unknown",
          blockedAt: serverTimestamp(),
          name: part?.name || "Bulk Blocked",
        }).catch(() => {});
      }

      const newBlockedUIDs: any[] = [];
      for (const uId of uniqueUIDs) {
        const part = selectedParts.find((p) => p.uid === uId);
        const safeIp = isValidId(part?.ip) ? part!.ip : "";
        const safeDev = isValidId(part?.deviceId) ? part!.deviceId! : "";
        await dbService.blockUID(uId, safeIp, safeDev);
        newBlockedUIDs.push({
          uid: uId,
          ip: safeIp || "Unknown",
          deviceId: safeDev || "Unknown",
          name: part?.name || "Bulk Blocked",
          blockedAt: new Date().toISOString(),
        });
        setDoc(doc(db, "blockedUIDs", safeDocId(uId)), {
          uid: uId,
          deviceId: safeDev || "Unknown",
          ip: safeIp || "Unknown",
          blockedAt: serverTimestamp(),
          name: part?.name || "Bulk Blocked",
        }).catch(() => {});
      }

      const matchedAll = participants.filter(
        (p) =>
          selectedParticipantIds.includes(p.id) ||
          (isValidId(p.ip) && uniqueIPs.includes(p.ip)) ||
          (isValidId(p.deviceId) && uniqueDevices.includes(p.deviceId)) ||
          (isValidId(p.uid) && uniqueUIDs.includes(p.uid)),
      );

      await dbService.markParticipantsBlocked(
        matchedAll.map((p) => p.id),
        true,
      );

      for (const p of matchedAll) {
        updateDoc(doc(db, "participants", p.id), { blocked: true }).catch(
          () => {},
        );
      }

      if (newBlockedRecords.length > 0) {
        setBlockedIPs((prev) => [
          ...newBlockedRecords,
          ...prev.filter((b) => !uniqueIPs.includes(b.ip)),
        ]);
      }
      if (newBlockedDevices.length > 0) {
        setBlockedDevices((prev) => [
          ...newBlockedDevices,
          ...prev.filter((d) => !uniqueDevices.includes(d.deviceId)),
        ]);
      }
      if (newBlockedUIDs.length > 0) {
        setBlockedUIDs((prev) => [
          ...newBlockedUIDs,
          ...prev.filter((u) => !uniqueUIDs.includes(u.uid)),
        ]);
      }

      const matchedIds = new Set(matchedAll.map((p) => p.id));
      setParticipants((prev) =>
        prev.map((p) => (matchedIds.has(p.id) ? { ...p, blocked: true } : p)),
      );

      setSelectedParticipantIds([]);
      showToast(
        "success",
        `${selectedParts.length} participant(s) have been permanently blocked.`,
      );
    } catch (err: any) {
      console.warn("Bulk block notice:", err);
      showToast("error", "Unable to complete bulk block. Please try again.");
    } finally {
      setIsBulkBlocking(false);
    }
  }

  // 10. Unblock user
  async function handleUnblockUser(
    targetIP?: string | null,
    targetDeviceId?: string | null,
    targetUid?: string | null,
  ) {
    try {
      const cleanIP = isValidId(targetIP) ? targetIP.trim() : "";
      let cleanDeviceId = isValidId(targetDeviceId)
        ? targetDeviceId.trim()
        : "";
      let cleanUid = isValidId(targetUid) ? targetUid.trim() : "";

      if (!cleanUid || !cleanDeviceId) {
        const found =
          participants.find(
            (p) =>
              (cleanIP && p.ip === cleanIP) ||
              (cleanDeviceId && p.deviceId === cleanDeviceId) ||
              (cleanUid && p.uid === cleanUid),
          ) ||
          demoParticipants.find(
            (p) =>
              (cleanIP && p.ip === cleanIP) ||
              (cleanDeviceId && p.deviceId === cleanDeviceId) ||
              (cleanUid && p.uid === cleanUid),
          );
        if (found) {
          if (!cleanUid && isValidId(found.uid)) cleanUid = found.uid.trim();
          if (!cleanDeviceId && isValidId(found.deviceId))
            cleanDeviceId = found.deviceId.trim();
        }
      }

      if (cleanIP) {
        await dbService.unblockIP(cleanIP);
        deleteDoc(doc(db, "blockedIPs", safeDocId(cleanIP))).catch(() => {});
      }

      if (cleanDeviceId) {
        await dbService.unblockDevice(cleanDeviceId);
        deleteDoc(doc(db, "blockedDevices", safeDocId(cleanDeviceId))).catch(
          () => {},
        );
      }

      if (cleanUid) {
        await dbService.unblockUID(cleanUid);
        deleteDoc(doc(db, "blockedUIDs", safeDocId(cleanUid))).catch(() => {});
      }

      const matchedParts = participants.filter(
        (p) =>
          (cleanIP && p.ip === cleanIP) ||
          (cleanDeviceId && p.deviceId === cleanDeviceId) ||
          (cleanUid && p.uid === cleanUid),
      );

      if (matchedParts.length > 0) {
        await dbService.markParticipantsBlocked(
          matchedParts.map((p) => p.id),
          false,
        );
        await Promise.allSettled(
          matchedParts.map((p) =>
            updateDoc(doc(db, "participants", p.id), { blocked: false }),
          ),
        );
      }

      const matchedDemoParts = demoParticipants.filter(
        (p) =>
          (cleanIP && p.ip === cleanIP) ||
          (cleanDeviceId && p.deviceId === cleanDeviceId) ||
          (cleanUid && p.uid === cleanUid),
      );

      if (matchedDemoParts.length > 0) {
        await Promise.allSettled([
          ...matchedDemoParts.map((p) =>
            dbService.markDemoParticipantBlocked(p.id, false),
          ),
          ...matchedDemoParts.map((p) =>
            updateDoc(doc(db, "demoParticipants", p.id), { blocked: false }),
          ),
        ]);
      }

      setBlockedIPs((prev) =>
        prev.filter(
          (b) =>
            (!cleanIP || b.ip !== cleanIP) &&
            (!cleanDeviceId || b.deviceId !== cleanDeviceId) &&
            (!cleanUid || b.uid !== cleanUid),
        ),
      );
      if (cleanDeviceId) {
        setBlockedDevices((prev) =>
          prev.filter((d) => d.deviceId !== cleanDeviceId),
        );
      }
      if (cleanUid) {
        setBlockedUIDs((prev) => prev.filter((u) => u.uid !== cleanUid));
      }

      setParticipants((prev) =>
        prev.map((p) =>
          (cleanIP && p.ip === cleanIP) ||
          (cleanDeviceId && p.deviceId === cleanDeviceId) ||
          (cleanUid && p.uid === cleanUid)
            ? { ...p, blocked: false }
            : p,
        ),
      );
      setDemoParticipants((prev) =>
        prev.map((p) =>
          (cleanIP && p.ip === cleanIP) ||
          (cleanDeviceId && p.deviceId === cleanDeviceId) ||
          (cleanUid && p.uid === cleanUid)
            ? { ...p, blocked: false }
            : p,
        ),
      );
      showToast("success", "Participant access has been restored.");
    } catch (err: any) {
      console.warn("Unblock user notice:", err);
      showToast("error", "Unable to unblock participant. Please try again.");
    }
  }

  // 10.5 Manual Block or Unblock by IP, UID, or Device ID directly
  async function handleManualUnblockOrBlock(action: "unblock" | "block") {
    const rawVal = manualBlockInput.trim();
    if (!rawVal) return;
    if (!isValidId(rawVal)) {
      setManualBlockMessage({
        type: "error",
        text: "Please enter a valid IP address, UID, or Device ID.",
      });
      return;
    }

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
          text: `Access restored for: ${rawVal}`,
        });
      } else {
        const nowIso = new Date().toISOString();
        if (targetIP) {
          const ipRecord: BlockedIP = {
            ip: targetIP,
            name: "Manual Block",
            deviceId: targetDeviceId || "Unknown",
            uid: targetUid || "Unknown",
            blockedAt: nowIso,
            reason: "Manually Blocked by Admin",
          };
          await dbService.blockIP(ipRecord);
          await setDoc(doc(db, "blockedIPs", safeDocId(targetIP)), {
            ip: targetIP,
            deviceId: targetDeviceId || "Unknown",
            uid: targetUid || "Unknown",
            name: "Manual Block",
            blockedAt: serverTimestamp(),
          });
          setBlockedIPs((prev) => [
            ipRecord,
            ...prev.filter((b) => b.ip !== targetIP),
          ]);
        }
        if (targetDeviceId) {
          await dbService.blockDevice(targetDeviceId, targetIP, targetUid);
          await setDoc(doc(db, "blockedDevices", safeDocId(targetDeviceId)), {
            deviceId: targetDeviceId,
            uid: targetUid || "Unknown",
            ip: targetIP || "Unknown",
            name: "Manual Block",
            blockedAt: serverTimestamp(),
          });
          setBlockedDevices((prev) => [
            {
              deviceId: targetDeviceId,
              ip: targetIP || "Unknown",
              uid: targetUid || "Unknown",
              name: "Manual Block",
              blockedAt: nowIso,
            },
            ...prev.filter((d) => d.deviceId !== targetDeviceId),
          ]);
        }
        if (targetUid) {
          await dbService.blockUID(targetUid, targetIP, targetDeviceId);
          await setDoc(doc(db, "blockedUIDs", safeDocId(targetUid)), {
            uid: targetUid,
            deviceId: targetDeviceId || "Unknown",
            ip: targetIP || "Unknown",
            name: "Manual Block",
            blockedAt: serverTimestamp(),
          });
          setBlockedUIDs((prev) => [
            {
              uid: targetUid,
              ip: targetIP || "Unknown",
              deviceId: targetDeviceId || "Unknown",
              name: "Manual Block",
              blockedAt: nowIso,
            },
            ...prev.filter((u) => u.uid !== targetUid),
          ]);
        }

        const matchedParts = participants.filter(
          (p) =>
            (targetIP && p.ip === targetIP) ||
            (targetDeviceId && p.deviceId === targetDeviceId) ||
            (targetUid && p.uid === targetUid),
        );
        if (matchedParts.length > 0) {
          await dbService.markParticipantsBlocked(
            matchedParts.map((p) => p.id),
            true,
          );
          matchedParts.forEach((p) => {
            updateDoc(doc(db, "participants", p.id), { blocked: true }).catch(
              () => {},
            );
          });
          const ids = new Set(matchedParts.map((p) => p.id));
          setParticipants((prev) =>
            prev.map((p) => (ids.has(p.id) ? { ...p, blocked: true } : p)),
          );
        }

        const matchedDemoParts = demoParticipants.filter(
          (p) =>
            (targetIP && p.ip === targetIP) ||
            (targetDeviceId && p.deviceId === targetDeviceId) ||
            (targetUid && p.uid === targetUid),
        );
        if (matchedDemoParts.length > 0) {
          matchedDemoParts.forEach((p) => {
            dbService.markDemoParticipantBlocked(p.id, true).catch(() => {});
            updateDoc(doc(db, "demoParticipants", p.id), {
              blocked: true,
            }).catch(() => {});
          });
          const ids = new Set(matchedDemoParts.map((p) => p.id));
          setDemoParticipants((prev) =>
            prev.map((p) => (ids.has(p.id) ? { ...p, blocked: true } : p)),
          );
        }

        setManualBlockMessage({
          type: "success",
          text: `Permanently blocked: ${rawVal}`,
        });
      }
      setManualBlockInput("");
    } catch (err: any) {
      setManualBlockMessage({
        type: "error",
        text: `Action failed: ${err?.message || "Unexpected error"}`,
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
  function handleDeleteAllParticipants(
    targetType: "all" | "regular" | "demo" = "all",
  ) {
    const regularCount = participants.length;
    const demoCount = demoParticipants.length;
    const totalCount =
      targetType === "regular"
        ? regularCount
        : targetType === "demo"
          ? demoCount
          : regularCount + demoCount;

    if (totalCount === 0) {
      showToast("error", "No join records found to delete.");
      return;
    }

    let confirmMsg = "";
    if (targetType === "regular") {
      confirmMsg = `Are you sure you want to delete all (${regularCount}) participant join records from the database? (The Blocked List will remain completely intact.)`;
    } else if (targetType === "demo") {
      confirmMsg = `Are you sure you want to delete all (${demoCount}) demo user join records from the database? (The Blocked List will remain completely intact.)`;
    } else {
      confirmMsg = `Are you sure you want to delete all (${regularCount} user and ${demoCount} demo) join records from the database? (The Blocked List will remain completely intact.)`;
    }

    setConfirmDialog({
      title: "Delete All Join Records",
      description: confirmMsg,
      confirmLabel: "Yes, Delete All Records",
      onConfirm: async () => {
        setIsDeletingAllParticipants(true);
        try {
          if (targetType === "all" || targetType === "regular") {
            await dbService.deleteAllParticipants();
          }
          if (targetType === "all" || targetType === "demo") {
            await dbService.deleteAllDemoParticipants();
          }

          if (targetType === "regular" || targetType === "all") {
            setParticipants([]);
            setSelectedParticipantIds([]);
            setSearchQuery("");
            setDateFilter("");
            try {
              localStorage.removeItem("ue_cache_participants");
            } catch (e) {}
          }

          if (targetType === "demo" || targetType === "all") {
            setDemoParticipants([]);
            setDemoSearchQuery("");
            setDemoDateFilter("");
            try {
              localStorage.removeItem("ue_cache_demo_participants");
            } catch (e) {}
          }

          if (targetType === "all" || targetType === "regular") {
            try {
              const pSnaps = await getDocs(collection(db, "participants"));
              await Promise.allSettled(pSnaps.docs.map((d) => deleteDoc(d.ref)));
            } catch (e) {}
          }

          if (targetType === "all" || targetType === "demo") {
            try {
              const dSnaps = await getDocs(collection(db, "demoParticipants"));
              await Promise.allSettled(dSnaps.docs.map((d) => deleteDoc(d.ref)));
            } catch (e) {}
          }

          showToast(
            "success",
            "All join records have been cleared successfully. The Blocked List remains intact.",
          );
        } catch (err: any) {
          console.error("Failed to delete records:", err);
          showToast("error", "Failed to clear records. Please try again.");
        } finally {
          setIsDeletingAllParticipants(false);
        }
      },
    });
  }

  // Logout Admin session
  async function handleLogout() {
    await signOut(auth);
    localStorage.removeItem("ue_admin_auth");
    setIsAuthenticated(false);
    setPasswordInput("");
    setLoginError(null);
    setShowPassword(false);
    setShowKeypad(true);
    setMeetInput("https://");
    setNewlyCreatedLink(null);
  }

  function handleCopy() {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopysuccess(true);
    setTimeout(() => setCopysuccess(false), 2000);
  }

  function handleCopyNewlyCreatedLink() {
    if (!newlyCreatedLink) return;
    navigator.clipboard.writeText(newlyCreatedLink);
    setCopysuccess(true);
    setTimeout(() => setCopysuccess(false), 2000);
  }

  // Format timestamp in clean English
  function formatBlockTime(timestamp: any) {
    if (!timestamp) return "Time unavailable";
    try {
      let date: Date;
      if (timestamp && typeof timestamp.toDate === "function") {
        date = timestamp.toDate();
      } else if (timestamp && typeof timestamp.seconds === "number") {
        date = new Date(timestamp.seconds * 1000);
      } else {
        date = new Date(timestamp);
      }

      if (isNaN(date.getTime())) return "Time unavailable";

      return date.toLocaleString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    } catch (e) {
      return "Time unavailable";
    }
  }

  function isSameDay(timestamp: any, filterDateStr: string) {
    if (!filterDateStr) return true;
    if (!timestamp) return false;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

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
  const filteredParticipants = dedupeItemsByKey<Participant>(
    participants.filter((p) => {
      const nameStr = (p.name || "").toLowerCase();
      const ipStr = p.ip || "";
      const uidStr = (p.uid || p.deviceId || "").toLowerCase();
      const qStr = (searchQuery || "").trim().toLowerCase();

      if (qStr) {
        return (
          nameStr.includes(qStr) || ipStr.includes(qStr) || uidStr.includes(qStr)
        );
      } else {
        if (!dateFilter) return true;
        return isSameDay(p.joinedAt, dateFilter);
      }
    }),
    (p) => p?.id,
  );

  // Filtering demo participants log list
  const filteredDemoParticipants = dedupeItemsByKey<any>(
    demoParticipants.filter((p) => {
      const nameStr = (p.name || "").toLowerCase();
      const gmailStr = (p.gmail || "").toLowerCase();
      const ipStr = p.ip || "";
      const uidStr = (p.uid || p.deviceId || "").toLowerCase();
      const qStr = (demoSearchQuery || "").trim().toLowerCase();

      if (qStr) {
        return (
          nameStr.includes(qStr) ||
          gmailStr.includes(qStr) ||
          ipStr.includes(qStr) ||
          uidStr.includes(qStr)
        );
      } else {
        if (!demoDateFilter) return true;
        return isSameDay(p.joinedAt, demoDateFilter);
      }
    }),
    (p) => p?.id,
  );

  const isParticipantBlocked = (p: any) => {
    if (p.blocked) return true;
    const validIp = isValidId(p.ip) ? p.ip : "";
    const validDev = isValidId(p.deviceId) ? p.deviceId : "";
    const validUid = isValidId(p.uid) ? p.uid : "";

    const ipBlocked =
      !!validIp && blockedIPs.some((b) => isValidId(b.ip) && b.ip === validIp);
    const devBlocked =
      !!validDev &&
      blockedDevices.some(
        (d) => isValidId(d.deviceId) && d.deviceId === validDev,
      );
    const uidBlocked =
      !!validUid &&
      blockedUIDs.some((u) => isValidId(u.uid) && u.uid === validUid);
    const matchedInIPs = blockedIPs.some((b) => {
      const ipMatch = !!validIp && isValidId(b.ip) && b.ip === validIp;
      const deviceMatch =
        !!validDev && isValidId(b.deviceId) && b.deviceId === validDev;
      const uidMatch = !!validUid && isValidId(b.uid) && b.uid === validUid;
      return ipMatch || deviceMatch || uidMatch;
    });
    return ipBlocked || devBlocked || uidBlocked || matchedInIPs;
  };

  const todayDateStr = getTodayDateString();
  const todayParticipantsCount = participants.filter((p) =>
    isSameDay(p.joinedAt, todayDateStr),
  ).length;
  const todayDemoParticipantsCount = demoParticipants.filter((p) =>
    isSameDay(p.joinedAt, todayDateStr),
  ).length;

  const displayUserCount = filteredParticipants.length;
  const displayDemoCount = filteredDemoParticipants.length;

  const filteredMeetings = dedupeItemsByKey<Meeting>(
    meetings.filter((m) => {
      if (!meetingsDateFilter) return true;
      if (m.meetingDate) {
        return m.meetingDate === meetingsDateFilter;
      }
      return isSameDay(m.createdAt, meetingsDateFilter);
    }),
    (m) => m?.id,
  );

  const { publicLink, testLink } = (() => {
    if (!generatedLink) return { publicLink: "", testLink: "" };

    const tLink = generatedLink;
    let pLink = generatedLink;
    if (pLink.includes("-dev-")) {
      pLink = pLink.replace("-dev-", "-pre-");
    }

    return { publicLink: pLink, testLink: tLink };
  })();

  // --- 1. CLEAN CORPORATE ADMIN LOGIN SCREEN (ONLY Admin Login & Calculator Keypad) ---
  if (!isAuthenticated) {
    const keypadRows = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
    ];

    const handleKeypadDigit = (digit: string) => {
      if (loginError) setLoginError(null);
      setPasswordInput((prev) => `${prev}${digit}`);
    };

    const handleKeypadBackspace = () => {
      if (loginError) setLoginError(null);
      setPasswordInput((prev) => prev.slice(0, -1));
    };

    const handleKeypadClear = () => {
      if (loginError) setLoginError(null);
      setPasswordInput("");
    };

    return (
      <div className="min-h-screen bg-[#f4f6f9] text-[#111827] flex flex-col justify-center items-center px-4 py-8 font-sans">
        <div className="w-full max-w-[410px] mx-auto space-y-3.5">
          {loginError && (
            <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-[#78350f] font-semibold leading-relaxed shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
              <AlertTriangle className="h-4 w-4 text-[#f59e0b] shrink-0 mt-0.5" />
              <p>{loginError}</p>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-[#e6eaf0] shadow-[0_8px_28px_rgba(15,23,42,0.06)] overflow-hidden"
          >
            <div className="h-1.5 bg-[#0b4a8b]" />

            <div className="p-6 space-y-5">
              {/* Corporate Brand Header */}
              <div className="flex items-center justify-between gap-3 border-b border-[#f1f5f9] pb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-[#0b4a8b] text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-[0_4px_12px_rgba(11,74,139,0.22)]">
                    UE
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg font-extrabold text-[#111827] tracking-tight leading-tight">
                      Admin Console Login
                    </h1>
                    <p className="text-[11px] font-semibold text-[#64748b] truncate">
                      Unity Earning • Authorized Staff Only
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-[#edf4fc] border border-[#d6e6f7] text-[#0b4a8b] rounded-lg text-[10px] font-extrabold shrink-0">
                  Secure PIN
                </span>
              </div>

              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1.5 w-full">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="admin-password-input"
                      className="block text-xs font-bold text-[#334155]"
                    >
                      Access PIN / Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowKeypad((prev) => !prev)}
                      className="text-[11px] font-extrabold text-[#0b4a8b] hover:text-[#093c72] transition cursor-pointer"
                    >
                      {showKeypad ? "Hide Keypad" : "Show Keypad"}
                    </button>
                  </div>

                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#64748b]">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      id="admin-password-input"
                      type={showPassword ? "text" : "password"}
                      inputMode={showKeypad ? "none" : "text"}
                      required
                      autoFocus
                      autoComplete="new-password"
                      placeholder="Enter access PIN"
                      value={passwordInput}
                      onFocus={() => setShowKeypad(true)}
                      onChange={(e) => {
                        if (loginError) setLoginError(null);
                        setPasswordInput(e.target.value);
                      }}
                      className="w-full pl-10 pr-11 py-3 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-[#111827] placeholder-[#94a3b8] focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] focus:bg-white text-sm tracking-widest transition font-bold tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#64748b] hover:text-[#0b4a8b] transition cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Calculator-Style Numeric Keypad (1-9 then 0) */}
                {showKeypad && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#f8fafc] border border-[#e6eaf0] rounded-2xl p-3 space-y-2"
                  >
                    <div className="grid grid-cols-3 gap-2">
                      {keypadRows.flat().map((digit) => (
                        <button
                          key={digit}
                          type="button"
                          onClick={() => handleKeypadDigit(digit)}
                          className="h-12 bg-white hover:bg-[#edf4fc] active:scale-[0.97] border border-[#e2e8f0] hover:border-[#0b4a8b]/40 rounded-xl text-base font-extrabold text-[#111827] hover:text-[#0b4a8b] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition cursor-pointer select-none tabular-nums flex items-center justify-center"
                        >
                          {digit}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={handleKeypadClear}
                        className="h-12 bg-[#fff8e6] hover:bg-[#fef0c7] active:scale-[0.97] border border-[#fde6b0] rounded-xl text-xs font-extrabold text-[#92400e] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition cursor-pointer select-none flex items-center justify-center"
                        title="Clear PIN"
                      >
                        Clear
                      </button>

                      <button
                        type="button"
                        onClick={() => handleKeypadDigit("0")}
                        className="h-12 bg-white hover:bg-[#edf4fc] active:scale-[0.97] border border-[#e2e8f0] hover:border-[#0b4a8b]/40 rounded-xl text-base font-extrabold text-[#111827] hover:text-[#0b4a8b] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition cursor-pointer select-none tabular-nums flex items-center justify-center"
                      >
                        0
                      </button>

                      <button
                        type="button"
                        onClick={handleKeypadBackspace}
                        aria-label="Backspace"
                        className="h-12 bg-white hover:bg-rose-50 active:scale-[0.97] border border-[#e2e8f0] hover:border-rose-200 rounded-xl text-[#475569] hover:text-rose-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition cursor-pointer select-none flex items-center justify-center"
                        title="Backspace"
                      >
                        <Delete className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3.5 bg-[#0b4a8b] hover:bg-[#093c72] text-white text-sm font-extrabold rounded-xl shadow-[0_4px_14px_rgba(11,74,139,0.24)] transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Verifying Access...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 text-white" />
                      <span>Sign In to Admin Panel</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // --- 2. MAIN LOGGED-IN ADMIN PANEL ---
  return (
    <div className="h-screen supports-[height:100dvh]:h-[100dvh] md:h-auto md:min-h-screen bg-[#f4f6f9] text-[#111827] flex flex-col overflow-hidden md:overflow-visible select-text font-sans">
      {/* STICKY CORPORATE HEADER */}
      <header className="shrink-0 sticky top-0 z-30 bg-white border-b border-[#e6eaf0] shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-[#0b4a8b] text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-[0_2px_6px_rgba(11,74,139,0.22)]">
              UE
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-[#111827] leading-tight truncate">
                Unity Earning
              </h2>
              <p className="text-[11px] text-[#64748b] font-semibold truncate">
                {activeTab === "dashboard" && "Executive Dashboard"}
                {activeTab === "meeting" && "Session Link Manager"}
                {activeTab === "data" && "Participant Attendance Logs"}
                {activeTab === "demo" && "Demo Session Logs"}
                {activeTab === "blocked" && "Restricted Access Registry"}
                {activeTab === "settings" && "System & Security Controls"}
              </p>
            </div>
          </div>

          {/* Desktop Horizontal Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-[#f4f6f9] p-1 rounded-xl border border-[#e6eaf0]">
            <button
              type="button"
              onClick={() => handleTabChange("dashboard")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-[#0b4a8b] text-white shadow-xs"
                  : "text-[#475569] hover:text-[#111827] hover:bg-white"
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("meeting")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === "meeting"
                  ? "bg-[#0b4a8b] text-white shadow-xs"
                  : "text-[#475569] hover:text-[#111827] hover:bg-white"
              }`}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              <span>Meeting Link</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("data")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === "data"
                  ? "bg-[#0b4a8b] text-white shadow-xs"
                  : "text-[#475569] hover:text-[#111827] hover:bg-white"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>User Logs</span>
              {displayUserCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 leading-none rounded text-[10px] font-extrabold tabular-nums ${
                    activeTab === "data"
                      ? "bg-white text-[#0b4a8b]"
                      : "bg-[#ddf1fa] text-[#0b4a8b]"
                  }`}
                >
                  {displayUserCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("demo")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === "demo"
                  ? "bg-[#0b4a8b] text-white shadow-xs"
                  : "text-[#475569] hover:text-[#111827] hover:bg-white"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Demo Logs</span>
              {displayDemoCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 leading-none rounded text-[10px] font-extrabold tabular-nums ${
                    activeTab === "demo"
                      ? "bg-white text-[#0b4a8b]"
                      : "bg-[#dcfce7] text-[#0d7a5f]"
                  }`}
                >
                  {displayDemoCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("blocked")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === "blocked"
                  ? "bg-[#0b4a8b] text-white shadow-xs"
                  : "text-[#475569] hover:text-[#111827] hover:bg-white"
              }`}
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Blocked List</span>
              {blockedIPs.length > 0 && (
                <span
                  className={`px-1.5 py-0.5 leading-none rounded text-[10px] font-extrabold tabular-nums ${
                    activeTab === "blocked"
                      ? "bg-white text-[#0b4a8b]"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {blockedIPs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("settings")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === "settings"
                  ? "bg-[#0b4a8b] text-white shadow-xs"
                  : "text-[#475569] hover:text-[#111827] hover:bg-white"
              }`}
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {generatedLink && (
              <button
                type="button"
                onClick={async () => {
                  if (navigator.share) {
                    try {
                      await navigator.share({
                        title: "Unity Earning Join Link",
                        text: "Click the link below to join the meeting session:",
                        url: publicLink,
                      });
                    } catch (err: any) {
                      if (err.name !== "AbortError") {
                        handleCopy();
                        showToast("success", "Public meeting link copied.");
                      }
                    }
                  } else {
                    handleCopy();
                    showToast("success", "Public meeting link copied.");
                  }
                }}
                className="h-9 px-3 bg-[#edf4fc] hover:bg-[#dcebfa] border border-[#d6e6f7] text-[#0b4a8b] transition rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-xs font-extrabold"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              title="Logout"
              className="h-9 px-2.5 bg-[#f8fafc] hover:bg-rose-50 border border-[#e6eaf0] hover:border-rose-200 text-[#475569] hover:text-rose-600 transition rounded-xl flex items-center justify-center gap-1 cursor-pointer text-xs font-bold"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden lg:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT BODY */}
      <main
        ref={mainScrollRef}
        className="flex-1 min-h-0 overflow-y-auto md:overflow-visible w-full max-w-5xl mx-auto px-3.5 sm:px-6 pt-4 pb-6 md:pb-10 space-y-4"
      >
        {/* In-App Toast Banner */}
        {toastMessage && (
          <div
            className={`rounded-2xl px-4 py-3 border flex items-center justify-between gap-3 text-xs font-bold shadow-sm ${
              toastMessage.type === "success"
                ? "bg-[#edf4fc] border-[#d6e6f7] text-[#0b4a8b]"
                : "bg-[#fff8e6] border-[#fde6b0] text-[#78350f]"
            }`}
          >
            <div className="flex items-center gap-2">
              {toastMessage.type === "success" ? (
                <CheckCircle className="h-4 w-4 text-[#0d7a5f] shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-[#f59e0b] shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Firestore Quota Fallback Notice */}
        {quotaExceeded && (
          <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-2xl px-4 py-3 flex items-center justify-between gap-2.5 text-xs text-[#78350f]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-[#f59e0b] shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">
                Secondary backup daily quota reached. All records continue to save safely in your primary Supabase database.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuotaExceeded(false)}
              className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
              aria-label="Dismiss notice"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* --- TAB 1: DASHBOARD --- */}
        {activeTab === "dashboard" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Left Deep Navy Card: Active Meeting & Public Link */}
              <div className="bg-[#0b4a8b] text-white rounded-2xl p-5 shadow-[0_6px_18px_rgba(11,74,139,0.18)] flex flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          generatedLink ? "bg-[#34d399]" : "bg-white/50"
                        }`}
                      />
                      <span className="text-[11px] font-bold text-white/80">
                        {generatedLink ? "Active Public Link" : "Meeting Link Setup"}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold mt-1">
                      {generatedLink
                        ? "Public Join Portal Active"
                        : "No Active Link Created"}
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 bg-white text-[#0b4a8b] rounded-md text-[10px] font-extrabold shrink-0">
                    {publicLinkActive ? "Live" : "Paused"}
                  </span>
                </div>

                {generatedLink ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 bg-white/10 border border-white/15 px-3 py-2 rounded-xl">
                      <span className="flex-1 truncate font-mono text-[11px] text-white font-semibold">
                        {publicLink}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(publicLink);
                          setCopysuccess(true);
                          setTimeout(() => setCopysuccess(false), 2000);
                        }}
                        className="px-2.5 py-1 bg-white text-[#0b4a8b] hover:bg-[#edf4fc] rounded-lg text-[10px] font-extrabold transition cursor-pointer shrink-0 flex items-center gap-1"
                      >
                        {copysuccess ? (
                          <>
                            <Check className="h-3 w-3 text-[#0d7a5f]" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <a
                        href={testLink || publicLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2.5 bg-white text-[#0b4a8b] hover:bg-[#edf4fc] rounded-xl text-xs font-extrabold transition"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Test Link</span>
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          if (navigator.share) {
                            try {
                              await navigator.share({
                                title: "Unity Earning",
                                text: "Join Counselling Meeting",
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
                        className="flex items-center justify-center gap-1.5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-extrabold transition cursor-pointer"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Share Link</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleTabChange("meeting")}
                    className="w-full py-2.5 bg-white text-[#0b4a8b] hover:bg-[#edf4fc] rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    <span>Create New Meeting Link</span>
                  </button>
                )}
              </div>

              {/* Right Dark Charcoal Card: Saved Participants & Today Summary */}
              <div className="bg-[#24272c] text-white rounded-2xl p-5 shadow-[0_6px_18px_rgba(15,23,42,0.14)] flex flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-white/75">
                      Total Saved Joins
                    </span>
                    <h3 className="text-2xl font-extrabold mt-1 tabular-nums">
                      {isDataLoading && !hasCachedData ? (
                        <span className="inline-block w-24 h-7 bg-white/15 animate-pulse rounded" />
                      ) : (
                        `${participants.length} Participants`
                      )}
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 bg-white/15 text-white rounded-md text-[10px] font-bold shrink-0 tabular-nums">
                    Active Sessions: {meetings.filter((m) => m.active).length}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
                  <div className="bg-white/10 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-white/70 font-semibold">
                      Today&apos;s Joins
                    </p>
                    <p className="text-sm font-extrabold text-white mt-0.5 tabular-nums">
                      {todayParticipantsCount}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-white/70 font-semibold">
                      Demo Joins
                    </p>
                    <p className="text-sm font-extrabold text-white mt-0.5 tabular-nums">
                      {demoParticipants.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2-Column White KPI Cards */}
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => handleTabChange("data")}
                className="bg-white rounded-2xl border border-[#e6eaf0] p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] hover:border-[#0b4a8b]/40 transition cursor-pointer flex items-center justify-between text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-[#111827] truncate">
                    User Logs
                  </p>
                  <p className="text-xs font-bold text-[#0d7a5f] mt-0.5 tabular-nums truncate">
                    {isDataLoading && !hasCachedData
                      ? "Loading..."
                      : `${participants.length} Saved`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#94a3b8] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("blocked")}
                className="bg-white rounded-2xl border border-[#e6eaf0] p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] hover:border-[#0b4a8b]/40 transition cursor-pointer flex items-center justify-between text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-[#111827] truncate">
                    Blocked IPs
                  </p>
                  <p className="text-xs font-bold text-[#0d7a5f] mt-0.5 tabular-nums truncate">
                    {isDataLoading && !hasCachedData
                      ? "Loading..."
                      : `${blockedIPs.length} Blocked`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#94a3b8] shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* --- TAB 2: MEETING LINK GENERATION --- */}
        {activeTab === "meeting" && (
          <div className="space-y-4">
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-4">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                <h3 className="text-sm font-extrabold text-[#111827] flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#0b4a8b]" />
                  <span>Google Meet Setup & Scheduling</span>
                </h3>
                <span className="px-2.5 py-0.5 bg-[#ddf1fa] text-[#0b4a8b] rounded-md text-[10px] font-extrabold">
                  Session Config
                </span>
              </div>

              <form onSubmit={handleSaveMeeting} className="space-y-3.5">
                    <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#334155] block">
                    Google Meet URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://meet.google.com/abc-defg-hij"
                    value={meetInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(
                        /^https?:\/\/(https?:\/\/)/i,
                        "$1",
                      );
                      setMeetInput(val);
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] focus:bg-white font-semibold transition"
                  />
                </div>

                {/* Scheduled Date & Time Pickers */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#334155] block">
                      Session Date
                    </label>
                    <input
                      type="date"
                      required
                      value={meetingDateInput}
                      onChange={(e) => setMeetingDateInput(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#334155] block">
                      Session Time
                    </label>
                    <input
                      type="time"
                      required
                      value={meetingTimeInput}
                      onChange={(e) => setMeetingTimeInput(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-[#f8fafc] rounded-xl border border-[#e6eaf0]">
                  <div className="pr-3">
                    <p className="text-xs font-extrabold text-[#111827]">
                      Public Join Session Active
                    </p>
                    <p className="text-[11px] text-[#64748b] mt-0.5">
                      When turned off, participants cannot enter this meeting
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMeetLinkActive(!isMeetLinkActive)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isMeetLinkActive ? "bg-[#0b4a8b]" : "bg-[#cbd5e1]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isMeetLinkActive ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={
                    isSavingLink ||
                    !meetInput.trim() ||
                    meetInput.trim() === "https://" ||
                    meetInput.trim() === "http://"
                  }
                  className="w-full py-3 bg-[#0b4a8b] hover:bg-[#093c72] text-white font-extrabold text-xs rounded-xl shadow-[0_4px_12px_rgba(11,74,139,0.2)] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isSavingLink ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Configure Session & Activate Link"
                  )}
                </button>
              </form>

              {/* LIVE DISPLAY BOX (Appears only after clicking Configure Session & Activate Link) */}
              {newlyCreatedLink && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 bg-[#edf4fc] border border-[#d6e6f7] rounded-2xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white text-[#0b4a8b] border border-[#d6e6f7] rounded-md font-extrabold text-[10px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0d7a5f]" />
                      Live Generated Link
                    </span>

                    {meetingDateInput && (
                      <div className="flex items-center gap-1.5 bg-white border border-[#d6e6f7] text-[#0d7a5f] px-2.5 py-1 rounded-lg text-[11px] font-extrabold tabular-nums">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {formatMeetingDateTime(
                            meetingDateInput,
                            meetingTimeInput,
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-xs font-extrabold text-[#111827]">
                      Public Share Link for Participants:
                    </h4>
                    <p className="text-[11px] text-[#475569]">
                      Copy and share this link. Participants will enter their name before redirecting to Google Meet.
                    </p>
                  </div>

                  <div className="bg-white px-3 py-2.5 rounded-xl border border-[#d6e6f7] select-all font-mono text-[11px] font-bold text-[#0b4a8b] flex justify-between items-center gap-2">
                    <span className="truncate">{newlyCreatedLink}</span>
                    <button
                      type="button"
                      onClick={handleCopyNewlyCreatedLink}
                      className="p-1.5 hover:bg-[#edf4fc] text-[#0b4a8b] rounded-lg shrink-0 transition cursor-pointer"
                      title="Copy"
                    >
                      {copysuccess ? (
                        <Check className="h-4 w-4 text-[#0d7a5f]" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleCopyNewlyCreatedLink}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                        copysuccess
                          ? "bg-[#0d7a5f] text-white"
                          : "bg-[#0b4a8b] text-white hover:bg-[#093c72]"
                      }`}
                    >
                      {copysuccess ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {copysuccess ? "Copied Successfully" : "Copy New Join Link"}
                      </span>
                    </button>

                    <a
                      href={
                        newlyCreatedLink.includes("?join=")
                          ? `${window.location.origin}/?join=${newlyCreatedLink.split("?join=")[1]}`
                          : newlyCreatedLink
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-white border border-[#cbd5e1] text-[#111827] hover:border-[#0b4a8b] hover:text-[#0b4a8b] text-xs font-extrabold rounded-xl flex items-center gap-1.5 transition"
                      title="Verify link in new tab"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Verify</span>
                    </a>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Saved Sessions Log */}
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3.5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 pb-3 border-b border-[#f1f5f9]">
                <div className="flex items-center justify-between w-full sm:w-auto gap-2.5">
                  <h3 className="text-sm font-extrabold text-[#111827] tabular-nums">
                    Saved Session Logs ({filteredMeetings.length})
                  </h3>
                  {meetings.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteAllMeetings}
                      disabled={isDeletingAllMeetings}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 rounded-xl text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Delete all saved meeting links"
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

                {/* Segmented Date Filter */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMeetingsDateFilter("")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer tabular-nums ${
                      !meetingsDateFilter
                        ? "bg-[#0b4a8b] text-white border-[#0b4a8b]"
                        : "bg-[#f8fafc] text-[#475569] border-[#e6eaf0] hover:bg-white"
                    }`}
                  >
                    All ({meetings.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetingsDateFilter(getTodayDateString())}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      meetingsDateFilter === getTodayDateString()
                        ? "bg-[#0b4a8b] text-white border-[#0b4a8b]"
                        : "bg-[#f8fafc] text-[#475569] border-[#e6eaf0] hover:bg-white"
                    }`}
                  >
                    Today
                  </button>
                  <input
                    type="date"
                    value={meetingsDateFilter}
                    onChange={(e) => setMeetingsDateFilter(e.target.value)}
                    className="text-[11px] px-2 py-1 border border-[#e6eaf0] rounded-lg bg-[#f8fafc] font-bold text-[#111827] focus:outline-none focus:border-[#0b4a8b]"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                {filteredMeetings.length === 0 ? (
                  <p className="text-xs text-[#64748b] text-center py-6">
                    {meetingsDateFilter
                      ? "No session records found for the selected date."
                      : "No saved session records found."}
                  </p>
                ) : (
                  filteredMeetings.map((m) => (
                    <div
                      key={m.id}
                      className="bg-[#f8fafc] p-3.5 rounded-xl border border-[#e6eaf0] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs font-extrabold text-[#0b4a8b]">
                            {m.id}
                          </code>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                              m.active
                                ? "bg-[#dcfce7] text-[#0d7a5f]"
                                : "bg-[#e2e8f0] text-[#475569]"
                            }`}
                          >
                            {m.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748b] font-mono truncate">
                          {m.googleMeetLink}
                        </p>
                        {m.meetingDate && (
                          <p className="text-[11px] text-[#0b4a8b] font-bold flex items-center gap-1 tabular-nums">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span>
                              {formatMeetingDateTime(m.meetingDate, m.meetingTime)}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="flex gap-1.5 shrink-0 items-center">
                        {deletingMeetingId === m.id ? (
                          <div className="flex items-center gap-1 bg-rose-50 p-1.5 rounded-xl border border-rose-200 text-[11px]">
                            <span className="text-rose-700 font-bold px-1">
                              Delete?
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteMeeting(m.id)}
                              className="px-2 py-1 bg-rose-600 text-white font-extrabold rounded-lg hover:bg-rose-700 cursor-pointer"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingMeetingId(null)}
                              className="px-2 py-1 bg-white border border-[#e6eaf0] text-[#475569] font-bold rounded-lg hover:bg-slate-100 cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                toggleMeetingActive(m.id, m.active)
                              }
                              className={`text-[11px] font-extrabold px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                                m.active
                                  ? "border-[#fde6b0] bg-[#fff8e6] text-[#92400e] hover:bg-[#fef0c7]"
                                  : "border-[#bbf7d0] bg-[#dcfce7] text-[#0d7a5f] hover:bg-[#bbf7d0]"
                              }`}
                            >
                              {m.active ? "Pause" : "Activate"}
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingMeetingId(m.id)}
                              title="Delete Record"
                              className="p-1.5 px-2.5 border border-rose-200 bg-rose-50 hover:bg-rose-600 hover:text-white rounded-lg text-rose-600 hover:border-rose-600 transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 3: PARTICIPANT LOGS & DELETION --- */}
        {activeTab === "data" && (
          <div className="space-y-4">
            {/* Top Clear All Data Action Bar */}
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-[#111827] tabular-nums">
                  All Participant Join Records ({participants.length + demoParticipants.length})
                </h3>
                <p className="text-[11px] text-[#64748b] font-medium mt-0.5">
                  Clear all newly joined and previously saved user records at once (Blocked List stays intact)
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteAllParticipants("all")}
                disabled={
                  isDeletingAllParticipants ||
                  (participants.length === 0 && demoParticipants.length === 0)
                }
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(225,29,72,0.18)] shrink-0"
                title="Clear all participant and demo join records (Blocked List remains intact)"
              >
                {isDeletingAllParticipants ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>Clear All Data</span>
              </button>
            </div>

            {/* Search & Segmented Persistence Filter Card */}
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#64748b]">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="Search by name, IP, or UID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] focus:bg-white transition"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#f1f5f9]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDateFilter("")}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer tabular-nums ${
                      !dateFilter
                        ? "bg-[#0b4a8b] text-white border-[#0b4a8b]"
                        : "bg-[#f8fafc] text-[#475569] border-[#e6eaf0] hover:bg-white"
                    }`}
                  >
                    All Saved ({participants.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilter(getTodayDateString())}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer tabular-nums ${
                      dateFilter === getTodayDateString()
                        ? "bg-[#0b4a8b] text-white border-[#0b4a8b]"
                        : "bg-[#f8fafc] text-[#475569] border-[#e6eaf0] hover:bg-white"
                    }`}
                  >
                    Today ({todayParticipantsCount})
                  </button>
                </div>

                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-[#f8fafc] border border-[#e6eaf0] rounded-lg px-2.5 py-1 text-[11px] font-bold text-[#111827] focus:outline-none focus:border-[#0b4a8b]"
                />
              </div>
            </div>

            {/* Section Header */}
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div>
                <h3 className="text-sm font-extrabold text-[#111827] tabular-nums">
                  Participant Details ({filteredParticipants.length})
                </h3>
                <p className="text-[11px] text-[#64748b] font-medium">
                  All join records remain saved until explicitly cleared
                </p>
              </div>
            </div>

            {/* BULK BLOCK ENGINE CARD */}
            {filteredParticipants.length > 0 && (
              <div className="bg-white border border-[#e6eaf0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3">
                <div className="flex items-center gap-2.5 border-b border-[#f1f5f9] pb-2.5">
                  <div className="h-8 w-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                    <Ban className="h-4 w-4 text-rose-600" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-[#111827]">
                      Bulk Block Actions
                    </h4>
                    <p className="text-[11px] text-[#64748b]">
                      Select multiple participants below to restrict their IP, Device ID, and UID simultaneously
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <label
                    htmlFor="selectAllParticipants"
                    className="flex items-center gap-2.5 bg-[#f8fafc] border border-[#e6eaf0] py-2 px-3 rounded-xl cursor-pointer select-none hover:border-[#0b4a8b]/40 transition"
                  >
                    <input
                      type="checkbox"
                      id="selectAllParticipants"
                      checked={
                        filteredParticipants.filter(
                          (p) => !isParticipantBlocked(p),
                        ).length > 0 &&
                        filteredParticipants
                          .filter((p) => !isParticipantBlocked(p))
                          .every((p) =>
                            selectedParticipantIds.includes(p.id),
                          )
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const unblockedIds = filteredParticipants
                            .filter((p) => !isParticipantBlocked(p))
                            .map((p) => p.id);
                          setSelectedParticipantIds(unblockedIds);
                        } else {
                          setSelectedParticipantIds([]);
                        }
                      }}
                      className="h-4 w-4 rounded border-[#cbd5e1] text-[#0b4a8b] focus:ring-[#0b4a8b] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[#111827] tabular-nums">
                      Select All (
                      {
                        filteredParticipants.filter(
                          (p) => !isParticipantBlocked(p),
                        ).length
                      }
                      )
                    </span>
                  </label>

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
                    className={`px-4 py-2.5 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
                      selectedParticipantIds.length > 0
                        ? "bg-rose-600 hover:bg-rose-700 shadow-sm"
                        : "bg-[#64748b] hover:bg-[#475569]"
                    }`}
                  >
                    {isBulkBlocking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Blocking...</span>
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4" />
                        <span className="tabular-nums">
                          Block Selected{" "}
                          {selectedParticipantIds.length > 0
                            ? `(${selectedParticipantIds.length})`
                            : ""}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {allBlockTip && (
                  <div className="bg-[#fff8e6] border border-[#fde6b0] text-[#78350f] text-[11px] font-bold py-2 px-3 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-[#f59e0b] shrink-0" />
                    <span>
                      No participants selected. Check the boxes next to names first.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Participants List */}
            <div className="space-y-2.5">
              {filteredParticipants.length === 0 ? (
                <div className="bg-white border border-[#e6eaf0] rounded-2xl p-8 text-center">
                  <p className="text-xs text-[#64748b] font-medium">
                    No join logs found.
                  </p>
                </div>
              ) : (
                filteredParticipants.map((p) => {
                  const isSelected = selectedParticipantIds.includes(p.id);
                  const isBlocked = isParticipantBlocked(p);
                  return (
                    <div
                      key={p.id}
                      className={`border rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3 transition ${
                        isSelected
                          ? "bg-[#edf4fc] border-[#0b4a8b]"
                          : isBlocked
                            ? "bg-[#f8fafc] border-[#e6eaf0]"
                            : "bg-white border-[#e6eaf0]"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0">
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
                                    setSelectedParticipantIds((prev) => [
                                      ...prev,
                                      p.id,
                                    ]);
                                  }
                                }}
                                className="h-4 w-4 rounded border-[#cbd5e1] text-[#0b4a8b] focus:ring-[#0b4a8b] cursor-pointer"
                              />
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isBlocked ? "bg-rose-500" : "bg-[#0d7a5f]"
                                }`}
                              />
                              <h4 className="font-extrabold text-sm text-[#111827] truncate">
                                {p.name}
                              </h4>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  isBlocked
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-[#dcfce7] text-[#0d7a5f]"
                                }`}
                              >
                                {isBlocked ? "Blocked" : "Active"}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 font-mono text-[11px] text-[#64748b] tabular-nums">
                              <span>
                                IP:{" "}
                                <strong className="text-[#111827]">
                                  {p.ip || "Unknown"}
                                </strong>
                              </span>
                              <span>
                                UID:{" "}
                                <strong className="text-[#0b4a8b]">
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
                            <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-xl border border-rose-200 text-[10px]">
                              <span className="text-rose-700 font-bold px-1">
                                Delete?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteParticipant(p.id)}
                                className="px-2 py-0.5 bg-rose-600 text-white font-extrabold rounded-lg hover:bg-rose-700 cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingParticipantId(null)}
                                className="px-2 py-0.5 bg-white border border-[#e6eaf0] text-[#475569] font-bold rounded-lg hover:bg-slate-100 cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletingParticipantId(p.id)}
                              title="Delete Log"
                              className="p-1.5 border border-[#e6eaf0] hover:border-rose-200 hover:bg-rose-50 rounded-xl text-[#64748b] hover:text-rose-600 transition cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-[#f1f5f9]">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748b] tabular-nums">
                          <Clock className="h-3.5 w-3.5 text-[#0b4a8b] shrink-0" />
                          <span>{formatBlockTime(p.joinedAt)}</span>
                        </span>

                        {isBlocked ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleUnblockUser(p.ip, p.deviceId, p.uid)
                            }
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-[11px] transition cursor-pointer"
                          >
                            Blocked (Unblock)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleBlockUser(p)}
                            className="px-3 py-1.5 bg-[#0d7a5f] hover:bg-[#09604a] text-white font-extrabold rounded-xl text-[11px] transition cursor-pointer"
                          >
                            Block Permanently
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* --- TAB 3.5: DEMO LIST --- */}
        {activeTab === "demo" && (
          <div className="space-y-4">
            {/* Search & Segmented Persistence Filter Card */}
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#64748b]">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="Search by name, email, or IP..."
                  value={demoSearchQuery}
                  onChange={(e) => setDemoSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] focus:bg-white transition"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#f1f5f9]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDemoDateFilter("")}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer tabular-nums ${
                      !demoDateFilter
                        ? "bg-[#0b4a8b] text-white border-[#0b4a8b]"
                        : "bg-[#f8fafc] text-[#475569] border-[#e6eaf0] hover:bg-white"
                    }`}
                  >
                    All Saved ({demoParticipants.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoDateFilter(getTodayDateString())}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer tabular-nums ${
                      demoDateFilter === getTodayDateString()
                        ? "bg-[#0b4a8b] text-white border-[#0b4a8b]"
                        : "bg-[#f8fafc] text-[#475569] border-[#e6eaf0] hover:bg-white"
                    }`}
                  >
                    Today ({todayDemoParticipantsCount})
                  </button>
                </div>

                <input
                  type="date"
                  value={demoDateFilter}
                  onChange={(e) => setDemoDateFilter(e.target.value)}
                  className="bg-[#f8fafc] border border-[#e6eaf0] rounded-lg px-2.5 py-1 text-[11px] font-bold text-[#111827] focus:outline-none focus:border-[#0b4a8b]"
                />
              </div>
            </div>

            {/* Section Header */}
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div>
                <h3 className="text-sm font-extrabold text-[#111827] tabular-nums">
                  Demo User Logs ({filteredDemoParticipants.length})
                </h3>
                <p className="text-[11px] text-[#64748b] font-medium">
                  All demo join records remain saved until explicitly cleared
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {demoParticipants.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteAllParticipants("demo")}
                    disabled={isDeletingAllParticipants}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 rounded-xl text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Delete all demo logs (Blocked List remains intact)"
                  >
                    {isDeletingAllParticipants ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    <span>Clear All Data</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const currentFilter = demoDateFilter;
                    setDemoDateFilter("");
                    setTimeout(() => setDemoDateFilter(currentFilter), 10);
                  }}
                  className="text-[11px] font-extrabold text-[#0b4a8b] bg-[#edf4fc] border border-[#d6e6f7] hover:bg-[#dcebfa] px-2.5 py-1.5 rounded-xl cursor-pointer transition"
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Demo Participants List */}
            <div className="space-y-2.5">
              {filteredDemoParticipants.length === 0 ? (
                <div className="bg-white border border-[#e6eaf0] rounded-2xl p-8 text-center">
                  <p className="text-xs text-[#64748b] font-medium">
                    No demo join logs found.
                  </p>
                </div>
              ) : (
                filteredDemoParticipants.map((p) => {
                  const isBlocked = isParticipantBlocked(p);
                  return (
                    <div
                      key={p.id}
                      className={`border rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3 transition ${
                        isBlocked
                          ? "bg-[#f8fafc] border-[#e6eaf0]"
                          : "bg-white border-[#e6eaf0]"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2.5">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                isBlocked ? "bg-rose-500" : "bg-[#0d7a5f]"
                              }`}
                            />
                            <h4 className="font-extrabold text-sm text-[#111827] truncate">
                              {p.name}
                            </h4>
                            <span className="px-2 py-0.5 bg-[#ddf1fa] text-[#0b4a8b] rounded-md text-[10px] font-extrabold">
                              Demo
                            </span>
                          </div>

                          {p.gmail && (
                            <p className="text-xs text-[#0d7a5f] font-bold truncate">
                              {p.gmail}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 font-mono text-[11px] text-[#64748b] tabular-nums">
                            <span>
                              IP:{" "}
                              <strong className="text-[#111827]">
                                {p.ip || "Unknown"}
                              </strong>
                            </span>
                            <span>
                              UID:{" "}
                              <strong className="text-[#0b4a8b]">
                                {p.uid ||
                                  p.deviceId?.substring(
                                    p.deviceId.length - 8,
                                  ) ||
                                  "Unknown"}
                              </strong>
                            </span>
                            <span>
                              Device:{" "}
                              <strong className="text-[#111827]">
                                {p.deviceId
                                  ? p.deviceId.substring(0, 14) + "..."
                                  : "Unknown"}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {deletingDemoId === p.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-xl border border-rose-200 text-[10px]">
                              <span className="text-rose-700 font-bold px-1">
                                Delete?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteDemoLog(p.id)}
                                className="px-2 py-0.5 bg-rose-600 text-white font-extrabold rounded-lg hover:bg-rose-700 cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingDemoId(null)}
                                className="px-2 py-0.5 bg-white border border-[#e6eaf0] text-[#475569] font-bold rounded-lg hover:bg-slate-100 cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletingDemoId(p.id)}
                              title="Delete Log"
                              className="p-1.5 border border-[#e6eaf0] hover:border-rose-200 hover:bg-rose-50 rounded-xl text-[#64748b] hover:text-rose-600 transition cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-[#f1f5f9]">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748b] tabular-nums">
                          <Clock className="h-3.5 w-3.5 text-[#0b4a8b] shrink-0" />
                          <span>{formatBlockTime(p.joinedAt)}</span>
                        </span>

                        {!isBlocked ? (
                          <button
                            type="button"
                            onClick={() => handleBlockDemoUser(p)}
                            className="px-3 py-1.5 bg-[#0d7a5f] hover:bg-[#09604a] text-white rounded-xl text-[11px] font-extrabold transition cursor-pointer"
                          >
                            Block Permanently
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleUnblockUser(p.ip, p.deviceId, p.uid)
                            }
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-extrabold transition cursor-pointer"
                          >
                            Blocked (Unblock)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* --- TAB 4: BLOCKED LIST (NO reset-all or security toggle above Blocked List) --- */}
        {activeTab === "blocked" &&
          (() => {
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

            blockedIPs.forEach((b, idx) => {
              const cleanIp = isValidId(b.ip) ? b.ip.trim() : "";
              const cleanUid = isValidId(b.uid) ? b.uid.trim() : "";
              const cleanDev = isValidId(b.deviceId) ? b.deviceId.trim() : "";
              const key = cleanIp
                ? `ip:${cleanIp}`
                : cleanUid
                  ? `uid:${cleanUid}`
                  : cleanDev
                    ? `dev:${cleanDev}`
                    : `blocked:${idx}`;

              const matchedP = participants.find(
                (p) =>
                  (cleanIp && p.ip === cleanIp) ||
                  (cleanUid && p.uid === cleanUid) ||
                  (cleanDev && p.deviceId === cleanDev),
              );
              const matchedD = demoParticipants.find(
                (p) =>
                  (cleanIp && p.ip === cleanIp) ||
                  (cleanUid && p.uid === cleanUid) ||
                  (cleanDev && p.deviceId === cleanDev),
              );

              const matchedName =
                b.name ||
                matchedP?.name ||
                matchedD?.name ||
                "Unknown Participant";
              const matchedUid =
                cleanUid ||
                (isValidId(matchedP?.uid) ? matchedP!.uid! : "") ||
                (isValidId(matchedD?.uid) ? matchedD!.uid! : "") ||
                "N/A";
              const matchedDevId =
                cleanDev ||
                (isValidId(matchedP?.deviceId) ? matchedP!.deviceId! : "") ||
                (isValidId(matchedD?.deviceId) ? matchedD!.deviceId! : "") ||
                "N/A";
              const resolvedIp =
                cleanIp ||
                (isValidId(matchedP?.ip) ? matchedP!.ip : "") ||
                (isValidId(matchedD?.ip) ? matchedD!.ip : "") ||
                "N/A";
              const userAgent =
                matchedP?.userAgent || matchedD?.userAgent || "";
              const devInfo = getDeviceDetails(userAgent);

              map.set(key, {
                key,
                ip: resolvedIp,
                name: matchedName,
                uid: matchedUid,
                deviceId: matchedDevId,
                blockedAt:
                  b.blockedAt ||
                  matchedP?.joinedAt ||
                  matchedD?.joinedAt ||
                  new Date().toISOString(),
                deviceDetails: devInfo,
                userType: matchedD ? "Demo Participant" : "Regular Participant",
              });
            });

            blockedDevices.forEach((d, idx) => {
              const cleanDev = isValidId(d.deviceId) ? d.deviceId.trim() : "";
              if (!cleanDev) return;
              const existing = Array.from(map.values()).some(
                (entry) => entry.deviceId === cleanDev,
              );
              if (existing) return;

              const cleanIp = isValidId(d.ip) ? d.ip.trim() : "";
              const cleanUid = isValidId(d.uid) ? d.uid.trim() : "";
              const matchedP = participants.find((p) => p.deviceId === cleanDev);
              const matchedD = demoParticipants.find(
                (p) => p.deviceId === cleanDev,
              );
              const key = cleanIp ? `ip:${cleanIp}` : `dev:${cleanDev}:${idx}`;
              if (!map.has(key)) {
                map.set(key, {
                  key,
                  ip:
                    cleanIp ||
                    (isValidId(matchedP?.ip) ? matchedP!.ip : "") ||
                    (isValidId(matchedD?.ip) ? matchedD!.ip : "") ||
                    "N/A",
                  name:
                    d.name ||
                    matchedP?.name ||
                    matchedD?.name ||
                    "Blocked Device",
                  uid:
                    cleanUid ||
                    (isValidId(matchedP?.uid) ? matchedP!.uid! : "") ||
                    (isValidId(matchedD?.uid) ? matchedD!.uid! : "") ||
                    "N/A",
                  deviceId: cleanDev,
                  blockedAt:
                    d.blockedAt ||
                    matchedP?.joinedAt ||
                    matchedD?.joinedAt ||
                    new Date().toISOString(),
                  deviceDetails: getDeviceDetails(
                    matchedP?.userAgent || matchedD?.userAgent || "",
                  ),
                  userType: matchedD
                    ? "Demo Participant"
                    : "Regular Participant",
                });
              }
            });

            blockedUIDs.forEach((u, idx) => {
              const cleanUid = isValidId(u.uid) ? u.uid.trim() : "";
              if (!cleanUid) return;
              const existing = Array.from(map.values()).some(
                (entry) => entry.uid === cleanUid,
              );
              if (existing) return;

              const cleanIp = isValidId(u.ip) ? u.ip.trim() : "";
              const cleanDev = isValidId(u.deviceId) ? u.deviceId.trim() : "";
              const matchedP = participants.find((p) => p.uid === cleanUid);
              const matchedD = demoParticipants.find((p) => p.uid === cleanUid);
              const key = cleanIp ? `ip:${cleanIp}` : `uid:${cleanUid}:${idx}`;
              if (!map.has(key)) {
                map.set(key, {
                  key,
                  ip:
                    cleanIp ||
                    (isValidId(matchedP?.ip) ? matchedP!.ip : "") ||
                    (isValidId(matchedD?.ip) ? matchedD!.ip : "") ||
                    "N/A",
                  name:
                    u.name ||
                    matchedP?.name ||
                    matchedD?.name ||
                    "Blocked UID",
                  uid: cleanUid,
                  deviceId:
                    cleanDev ||
                    (isValidId(matchedP?.deviceId)
                      ? matchedP!.deviceId!
                      : "") ||
                    (isValidId(matchedD?.deviceId)
                      ? matchedD!.deviceId!
                      : "") ||
                    "N/A",
                  blockedAt:
                    u.blockedAt ||
                    matchedP?.joinedAt ||
                    matchedD?.joinedAt ||
                    new Date().toISOString(),
                  deviceDetails: getDeviceDetails(
                    matchedP?.userAgent || matchedD?.userAgent || "",
                  ),
                  userType: matchedD
                    ? "Demo Participant"
                    : "Regular Participant",
                });
              }
            });

            participants
              .filter((p) => p.blocked)
              .forEach((p) => {
                const cleanIp = isValidId(p.ip) ? p.ip.trim() : "";
                const cleanUid = isValidId(p.uid) ? p.uid.trim() : "";
                const cleanDev = isValidId(p.deviceId) ? p.deviceId.trim() : "";
                const alreadyInMap = Array.from(map.values()).some(
                  (entry) =>
                    (cleanIp && entry.ip === cleanIp) ||
                    (cleanUid && entry.uid === cleanUid) ||
                    (cleanDev && entry.deviceId === cleanDev),
                );
                const key = cleanIp ? `ip:${cleanIp}` : `part:${p.id}`;
                if (!alreadyInMap && !map.has(key)) {
                  const devInfo = getDeviceDetails(p.userAgent);
                  map.set(key, {
                    key,
                    ip: cleanIp || "N/A",
                    name: p.name || "Unknown Participant",
                    uid: cleanUid || p.id || "N/A",
                    deviceId: cleanDev || "N/A",
                    blockedAt: p.joinedAt || new Date().toISOString(),
                    deviceDetails: devInfo,
                    userType: "Regular Participant",
                  });
                }
              });

            demoParticipants
              .filter((p) => p.blocked)
              .forEach((p) => {
                const cleanIp = isValidId(p.ip) ? p.ip.trim() : "";
                const cleanUid = isValidId(p.uid) ? p.uid.trim() : "";
                const cleanDev = isValidId(p.deviceId) ? p.deviceId.trim() : "";
                const alreadyInMap = Array.from(map.values()).some(
                  (entry) =>
                    (cleanIp && entry.ip === cleanIp) ||
                    (cleanUid && entry.uid === cleanUid) ||
                    (cleanDev && entry.deviceId === cleanDev),
                );
                const key = cleanIp ? `ip:${cleanIp}` : `demo:${p.id}`;
                if (!alreadyInMap && !map.has(key)) {
                  const devInfo = getDeviceDetails(p.userAgent);
                  map.set(key, {
                    key,
                    ip: cleanIp || "N/A",
                    name: `${p.name || "Unknown Participant"} (Demo)`,
                    uid: cleanUid || p.id || "N/A",
                    deviceId: cleanDev || "N/A",
                    blockedAt: p.joinedAt || new Date().toISOString(),
                    deviceDetails: devInfo,
                    userType: "Demo Participant",
                  });
                }
              });

            const unifiedList = Array.from(map.values());

            const filteredBlockedList = unifiedList.filter((b) => {
              if (blockedSearchQuery) {
                const queryLower = blockedSearchQuery.toLowerCase().trim();
                const ipMatch = b.ip?.toLowerCase().includes(queryLower);
                const nameMatch = b.name?.toLowerCase().includes(queryLower);
                const uidMatch = b.uid?.toLowerCase().includes(queryLower);
                const devMatch = b.deviceId?.toLowerCase().includes(queryLower);
                const typeMatch = b.userType?.toLowerCase().includes(queryLower);
                if (
                  !ipMatch &&
                  !nameMatch &&
                  !uidMatch &&
                  !devMatch &&
                  !typeMatch
                )
                  return false;
              }

              if (blockedDateFilter) {
                if (!b.blockedAt) return false;
                try {
                  const bDate = b.blockedAt.toDate
                    ? b.blockedAt.toDate()
                    : new Date(b.blockedAt);
                  if (isNaN(bDate.getTime())) return false;
                  const yyyy = bDate.getFullYear();
                  const mm = String(bDate.getMonth() + 1).padStart(2, "0");
                  const dd = String(bDate.getDate()).padStart(2, "0");
                  const formattedDateStr = `${yyyy}-${mm}-${dd}`;
                  if (formattedDateStr !== blockedDateFilter) return false;
                } catch {
                  return false;
                }
              }
              return true;
            });

            const todayFormatted = getTodayDateString();
            const yesterdayFormatted = (() => {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yyyy = yesterday.getFullYear();
              const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
              const dd = String(yesterday.getDate()).padStart(2, "0");
              return `${yyyy}-${mm}-${dd}`;
            })();

            return (
              <div className="space-y-4">
                {/* Header Summary Card */}
                <div className="bg-white border border-[#e6eaf0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-1">
                  <h3 className="text-sm font-extrabold text-[#111827] flex items-center gap-2 tabular-nums">
                    <ShieldAlert className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                    <span>
                      Restricted IPs, Devices & UIDs ({filteredBlockedList.length})
                    </span>
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed">
                    Every blocked IP address, Device ID, UID, and restriction timestamp is permanently logged below. Click{" "}
                    <strong className="text-[#111827]">Unblock</strong> anytime to restore meeting access.
                  </p>
                </div>

                {/* DIRECT MANUAL UNBLOCK / BLOCK TOOL */}
                <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-2xl p-4 space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-extrabold text-[#78350f]">
                      Direct IP / UID / Device ID Block or Unblock
                    </h4>
                    <p className="text-[11px] text-[#92400e] leading-snug">
                      Paste any IP address (e.g.{" "}
                      <strong>202.47.164.169</strong>), UID (e.g.{" "}
                      <strong>UID-852424</strong>), or Device ID to block or unblock directly.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Enter IP (e.g. 202.47.164.169) or UID..."
                      value={manualBlockInput}
                      onChange={(e) => setManualBlockInput(e.target.value)}
                      className="flex-1 text-xs px-3.5 py-2.5 border border-[#fde6b0] rounded-xl focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] bg-white font-mono font-bold text-[#111827]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleManualUnblockOrBlock("unblock")}
                        disabled={manualBlockLoading || !manualBlockInput.trim()}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-[#0d7a5f] hover:bg-[#09604a] text-white font-extrabold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
                      >
                        Unblock
                      </button>
                      <button
                        type="button"
                        onClick={() => handleManualUnblockOrBlock("block")}
                        disabled={manualBlockLoading || !manualBlockInput.trim()}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
                      >
                        Block
                      </button>
                    </div>
                  </div>

                  {manualBlockMessage && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-bold border ${
                        manualBlockMessage.type === "success"
                          ? "bg-[#dcfce7] text-[#0d7a5f] border-[#bbf7d0]"
                          : "bg-rose-50 text-rose-800 border-rose-200"
                      }`}
                    >
                      {manualBlockMessage.text}
                    </div>
                  )}
                </div>

                {/* Filter & Search Card */}
                <div className="bg-white border border-[#e6eaf0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3">
                  <h4 className="text-xs font-extrabold text-[#111827] flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-[#0b4a8b]" />
                    <span>Filter & Search Blocked Records</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#64748b] block">
                        Block Date
                      </label>
                      <input
                        type="date"
                        value={blockedDateFilter}
                        onChange={(e) => setBlockedDateFilter(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-[#e6eaf0] rounded-xl focus:outline-none focus:border-[#0b4a8b] bg-[#f8fafc] font-bold text-[#111827]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#64748b] block">
                        Search Name, IP, or UID
                      </label>
                      <input
                        type="text"
                        placeholder="Name, IP, or UID..."
                        value={blockedSearchQuery}
                        onChange={(e) => setBlockedSearchQuery(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-[#e6eaf0] rounded-xl focus:outline-none focus:border-[#0b4a8b] bg-[#f8fafc] font-semibold text-[#111827] placeholder-[#94a3b8]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#f1f5f9]">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBlockedDateFilter(todayFormatted)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          blockedDateFilter === todayFormatted
                            ? "bg-[#0b4a8b] text-white border-[#0b4a8b]"
                            : "bg-[#f8fafc] text-[#475569] border-[#e6eaf0] hover:bg-white"
                        }`}
                      >
                        Blocked Today
                      </button>

                      <button
                        type="button"
                        onClick={() => setBlockedDateFilter(yesterdayFormatted)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          blockedDateFilter === yesterdayFormatted
                            ? "bg-[#0b4a8b] text-white border-[#0b4a8b]"
                            : "bg-[#f8fafc] text-[#475569] border-[#e6eaf0] hover:bg-white"
                        }`}
                      >
                        Yesterday
                      </button>
                    </div>

                    {(blockedDateFilter || blockedSearchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setBlockedDateFilter("");
                          setBlockedSearchQuery("");
                        }}
                        className="text-[11px] font-extrabold text-rose-600 cursor-pointer bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg hover:bg-rose-100 transition"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Blocked Users List */}
                <div className="space-y-3">
                  {filteredBlockedList.length === 0 ? (
                    <div className="bg-white border border-[#e6eaf0] rounded-2xl p-8 text-center">
                      <p className="text-xs text-[#64748b] font-medium">
                        No blocked users found.
                      </p>
                      {(blockedDateFilter || blockedSearchQuery) && (
                        <button
                          type="button"
                          onClick={() => {
                            setBlockedDateFilter("");
                            setBlockedSearchQuery("");
                          }}
                          className="mt-2.5 text-xs bg-[#edf4fc] border border-[#d6e6f7] px-3.5 py-1.5 rounded-xl text-[#0b4a8b] font-extrabold hover:bg-[#dcebfa] cursor-pointer transition"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredBlockedList.map((b) => (
                      <div
                        key={b.key}
                        className="bg-white border border-[#e6eaf0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                              <Ban className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-extrabold text-[#111827] truncate">
                                {b.name}
                              </h4>
                              <span className="text-[10.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md inline-block mt-0.5">
                                {b.userType} • Permanently Blocked
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleUnblockUser(b.ip, b.deviceId, b.uid)
                            }
                            className="px-3 py-1.5 bg-[#0d7a5f] hover:bg-[#09604a] text-white font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Unblock</span>
                          </button>
                        </div>

                        <div className="bg-[#f8fafc] border border-[#e6eaf0] rounded-xl p-3 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#64748b] font-semibold">
                              IP Address:
                            </span>
                            <span className="font-mono font-extrabold text-[#111827] bg-white border border-[#e6eaf0] px-2 py-0.5 rounded-md tabular-nums">
                              {b.ip}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#64748b] font-semibold">
                              UID:
                            </span>
                            <span className="font-mono font-extrabold text-[#0b4a8b] bg-white border border-[#e6eaf0] px-2 py-0.5 rounded-md tabular-nums">
                              {b.uid}
                            </span>
                          </div>

                          {b.deviceDetails && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[#64748b] font-semibold">
                                Device Model:
                              </span>
                              <span className="font-bold text-[#111827] flex items-center gap-1 text-[11px]">
                                {b.deviceDetails.iconType === "phone" && (
                                  <Smartphone className="h-3.5 w-3.5 text-[#64748b]" />
                                )}
                                {b.deviceDetails.iconType === "tablet" && (
                                  <Tablet className="h-3.5 w-3.5 text-[#64748b]" />
                                )}
                                {b.deviceDetails.iconType === "laptop" && (
                                  <Laptop className="h-3.5 w-3.5 text-[#64748b]" />
                                )}
                                {b.deviceDetails.iconType === "monitor" && (
                                  <Monitor className="h-3.5 w-3.5 text-[#64748b]" />
                                )}
                                <span>{b.deviceDetails.name}</span>
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#e6eaf0]">
                            <span className="text-[#64748b] font-semibold flex items-center gap-1 text-[11px]">
                              <Clock className="h-3.5 w-3.5 text-[#0b4a8b]" />
                              <span>Blocked At:</span>
                            </span>
                            <span className="font-bold text-[#111827] text-[11px] tabular-nums">
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
            {/* Security & Block Preferences */}
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-3">
                <h3 className="text-sm font-extrabold text-[#111827]">
                  Security & Access Settings
                </h3>
                <span className="px-2.5 py-0.5 bg-[#ddf1fa] text-[#0b4a8b] rounded-md text-[10px] font-extrabold">
                  Security
                </span>
              </div>

              {/* Prevent Repeat Joins Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[#f8fafc] rounded-xl border border-[#e6eaf0] gap-3">
                <div>
                  <p className="text-xs font-extrabold text-[#111827]">
                    Prevent Multiple Joins from Same IP
                  </p>
                  <p className="text-[11px] text-[#64748b] mt-0.5 leading-snug">
                    Keep enabled to prevent multiple devices on the same IP from joining the same session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleRepeatJoinsSetting}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    preventRepeatJoins ? "bg-[#0b4a8b]" : "bg-[#cbd5e1]"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      preventRepeatJoins ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* MASTER SECURITY BLOCK & RESET ALL BLOCKS SECTION (STRICTLY INSIDE SETTINGS) */}
              <div
                className={`flex flex-col gap-3.5 p-4 rounded-2xl border transition ${
                  blockSystemActive
                    ? "bg-[#edf4fc] border-[#d6e6f7]"
                    : "bg-[#dcfce7]/50 border-[#bbf7d0]"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldAlert
                        className={`h-4 w-4 shrink-0 ${
                          blockSystemActive
                            ? "text-[#0b4a8b]"
                            : "text-[#0d7a5f]"
                        }`}
                      />
                      <p className="text-xs font-extrabold text-[#111827]">
                        Security Block System
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                          blockSystemActive
                            ? "bg-white text-[#0b4a8b] border border-[#d6e6f7]"
                            : "bg-white text-[#0d7a5f] border border-[#bbf7d0]"
                        }`}
                      >
                        {blockSystemActive
                          ? "ON (Blocking Enforced)"
                          : "OFF (Access Allowed)"}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475569] leading-relaxed font-medium">
                      {blockSystemActive ? (
                        <>
                          <strong className="text-[#0b4a8b]">ON:</strong>{" "}
                          Blocked IPs, devices, and UIDs cannot enter any meeting.
                        </>
                      ) : (
                        <>
                          <strong className="text-[#0d7a5f]">OFF:</strong>{" "}
                          Even if an IP or device is blocked, users will still be allowed to enter the meeting.
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span className="text-xs font-extrabold text-[#334155]">
                      {blockSystemActive ? "ON" : "OFF"}
                    </span>
                    <button
                      type="button"
                      onClick={toggleBlockSystemSetting}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        blockSystemActive ? "bg-[#0b4a8b]" : "bg-[#0d7a5f]"
                      }`}
                      title={
                        blockSystemActive
                          ? "Turn OFF Security Block System"
                          : "Turn ON Security Block System"
                      }
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          blockSystemActive ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* RESET ALL BLOCKS INSIDE SETTINGS */}
                <div className="pt-3 border-t border-[#d6e6f7] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-0.5">
                    <p className="text-xs font-extrabold text-[#111827] flex items-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
                      <span>Reset All Blocked Records</span>
                    </p>
                    <p className="text-[11px] text-[#64748b] leading-snug">
                      Remove all existing IP, device, and UID blocks in one click so everyone can join again.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowResetBlockConfirm(true)}
                    disabled={isResettingAllBlocks}
                    className="self-start sm:self-auto px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RotateCcw
                      className={`h-3.5 w-3.5 ${
                        isResettingAllBlocks ? "animate-spin" : ""
                      }`}
                    />
                    <span>Reset All Blocks</span>
                  </button>
                </div>
              </div>

              {/* Public Link Active Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[#f8fafc] rounded-xl border border-[#e6eaf0] gap-3">
                <div>
                  <p className="text-xs font-extrabold text-[#111827]">
                    Keep Public Link Active
                  </p>
                  <p className="text-[11px] text-[#64748b] leading-snug mt-0.5">
                    When enabled, participants can join via the public link. Turn off to pause public access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={togglePublicLinkActiveSetting}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    publicLinkActive ? "bg-[#0b4a8b]" : "bg-[#cbd5e1]"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      publicLinkActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Announcement/Notice Settings */}
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3.5">
              <h3 className="text-sm font-extrabold text-[#111827] flex items-center gap-2 border-b border-[#f1f5f9] pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                <span>Home Screen Notice Settings</span>
              </h3>

              {noticeMessage && (
                <p
                  className={`p-3 rounded-xl border text-xs font-bold ${
                    noticeMessage.type === "success"
                      ? "bg-[#dcfce7] border-[#bbf7d0] text-[#0d7a5f]"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}
                >
                  {noticeMessage.text}
                </p>
              )}

              <form onSubmit={handleUpdateNotice} className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-[#f8fafc] rounded-xl border border-[#e6eaf0] gap-3">
                  <div>
                    <p className="text-xs font-extrabold text-[#111827]">
                      Notice Display Status
                    </p>
                    <p className="text-[11px] text-[#64748b] mt-0.5">
                      Enable to show a scrolling announcement bar on the participant join screen.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNoticeActive(!noticeActive)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      noticeActive ? "bg-[#0b4a8b]" : "bg-[#cbd5e1]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        noticeActive ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#334155] block">
                    Notice Message
                  </label>
                  <textarea
                    placeholder="e.g. Welcome! Today's counselling session starts at 9:00 PM. Please join on time."
                    value={noticeText}
                    onChange={(e) => setNoticeText(e.target.value)}
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs text-[#111827] font-semibold focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b] focus:bg-white transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingNotice}
                  className="w-full py-2.5 bg-[#0b4a8b] hover:bg-[#093c72] text-white font-extrabold text-xs rounded-xl transition cursor-pointer disabled:opacity-60"
                >
                  {isUpdatingNotice ? "Saving..." : "Update Notice Settings"}
                </button>
              </form>
            </div>

            {/* Demo Mode Settings */}
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3.5">
              <h3 className="text-sm font-extrabold text-[#111827] flex items-center gap-2 border-b border-[#f1f5f9] pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#0d7a5f]" />
                <span>Demo Mode Settings</span>
              </h3>

              <div className="flex items-center justify-between p-3.5 bg-[#f8fafc] rounded-xl border border-[#e6eaf0] gap-3">
                <div>
                  <p className="text-xs font-extrabold text-[#111827]">
                    Enable Demo Mode
                  </p>
                  <p className="text-[11px] text-[#64748b] leading-snug mt-0.5">
                    When enabled, users can access the Demo Portal with the 4-digit access code.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleDemoMode}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    demoModeActive ? "bg-[#0d7a5f]" : "bg-[#cbd5e1]"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      demoModeActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {demoModeActive && (
                <div className="space-y-3 pt-3 border-t border-dashed border-[#e6eaf0]">
                  {demoCodeMessage && (
                    <p
                      className={`p-3 rounded-xl border text-xs font-bold ${
                        demoCodeMessage.type === "success"
                          ? "bg-[#dcfce7] border-[#bbf7d0] text-[#0d7a5f]"
                          : "bg-rose-50 border-rose-200 text-rose-800"
                      }`}
                    >
                      {demoCodeMessage.text}
                    </p>
                  )}

                  <form onSubmit={handleUpdateDemoCode} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#334155] block">
                        Demo Access Code (4 digits)
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        pattern="[0-9]{4}"
                        required
                        placeholder="e.g. 1234"
                        value={demoCode}
                        onChange={(e) =>
                          setDemoCode(e.target.value.replace(/\D/g, ""))
                        }
                        className="w-full px-3.5 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs font-mono font-extrabold text-[#111827] focus:outline-none focus:ring-4 focus:ring-[#0d7a5f]/15 focus:border-[#0d7a5f] tabular-nums"
                      />
                      <p className="text-[11px] text-[#64748b]">
                        Users will enter this 4-digit code to access Demo Mode.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isUpdatingDemoCode}
                      className="w-full py-2.5 bg-[#0d7a5f] hover:bg-[#09604a] text-white font-extrabold text-xs rounded-xl transition cursor-pointer disabled:opacity-60"
                    >
                      {isUpdatingDemoCode ? "Saving..." : "Update Demo Code"}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Password Settings */}
            <div className="bg-white border border-[#e6eaf0] rounded-2xl p-5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3.5">
              <h3 className="text-sm font-extrabold text-[#111827] border-b border-[#f1f5f9] pb-3">
                Admin Access Credentials
              </h3>

              {pwdMessage && (
                <p
                  className={`p-3 rounded-xl border text-xs font-bold ${
                    pwdMessage.type === "success"
                      ? "bg-[#dcfce7] border-[#bbf7d0] text-[#0d7a5f]"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}
                >
                  {pwdMessage.text}
                </p>
              )}

              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#334155] block">
                    New Admin Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter at least 4 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#334155] block">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Re-enter password to confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-4 focus:ring-[#0b4a8b]/12 focus:border-[#0b4a8b]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingPwd}
                  className="w-full py-2.5 bg-[#24272c] hover:bg-[#111827] text-white font-extrabold text-xs rounded-xl transition cursor-pointer disabled:opacity-60"
                >
                  {isUpdatingPwd ? "Updating..." : "Save New Password"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* --- MOBILE BOTTOM NAVIGATION BAR (md:hidden) --- */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden shrink-0 w-full h-16 bg-white border-t border-[#e6eaf0] flex items-stretch justify-around shadow-[0_-4px_16px_rgba(15,23,42,0.06)] px-1 py-1 select-none z-50 pointer-events-auto"
      >
        <button
          type="button"
          onClick={() => handleTabChange("dashboard")}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl cursor-pointer touch-manipulation transition active:scale-95 ${
            activeTab === "dashboard"
              ? "text-[#0b4a8b] bg-[#edf4fc] font-extrabold"
              : "text-[#64748b] hover:text-[#111827] font-semibold"
          }`}
        >
          <LayoutDashboard className="h-[18px] w-[18px] pointer-events-none shrink-0" />
          <span className="text-[10px] leading-none pointer-events-none truncate">
            Home
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("meeting")}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl cursor-pointer touch-manipulation transition active:scale-95 ${
            activeTab === "meeting"
              ? "text-[#0b4a8b] bg-[#edf4fc] font-extrabold"
              : "text-[#64748b] hover:text-[#111827] font-semibold"
          }`}
        >
          <LinkIcon className="h-[18px] w-[18px] pointer-events-none shrink-0" />
          <span className="text-[10px] leading-none pointer-events-none truncate">
            Link
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("data")}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl cursor-pointer touch-manipulation transition active:scale-95 relative ${
            activeTab === "data"
              ? "text-[#0b4a8b] bg-[#edf4fc] font-extrabold"
              : "text-[#64748b] hover:text-[#111827] font-semibold"
          }`}
        >
          <Users className="h-[18px] w-[18px] pointer-events-none shrink-0" />
          <span className="text-[10px] leading-none pointer-events-none truncate">
            Users
          </span>
          {displayUserCount > 0 && (
            <span className="pointer-events-none absolute top-0.5 right-1 px-1.5 py-0.5 leading-none bg-[#0b4a8b] text-white font-extrabold rounded-full text-[9px] tabular-nums">
              {displayUserCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("demo")}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl cursor-pointer touch-manipulation transition active:scale-95 relative ${
            activeTab === "demo"
              ? "text-[#0b4a8b] bg-[#edf4fc] font-extrabold"
              : "text-[#64748b] hover:text-[#111827] font-semibold"
          }`}
        >
          <UserCheck className="h-[18px] w-[18px] pointer-events-none shrink-0" />
          <span className="text-[10px] leading-none pointer-events-none truncate">
            Demo
          </span>
          {displayDemoCount > 0 && (
            <span className="pointer-events-none absolute top-0.5 right-1 px-1.5 py-0.5 leading-none bg-[#0d7a5f] text-white font-extrabold rounded-full text-[9px] tabular-nums">
              {displayDemoCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("blocked")}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl cursor-pointer touch-manipulation transition active:scale-95 relative ${
            activeTab === "blocked"
              ? "text-[#0b4a8b] bg-[#edf4fc] font-extrabold"
              : "text-[#64748b] hover:text-[#111827] font-semibold"
          }`}
        >
          <Ban className="h-[18px] w-[18px] pointer-events-none shrink-0" />
          <span className="text-[10px] leading-none pointer-events-none truncate">
            Blocked
          </span>
          {blockedIPs.length > 0 && (
            <span className="pointer-events-none absolute top-0.5 right-1 px-1.5 py-0.5 leading-none bg-rose-600 text-white font-extrabold rounded-full text-[9px] tabular-nums">
              {blockedIPs.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("settings")}
          className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl cursor-pointer touch-manipulation transition active:scale-95 ${
            activeTab === "settings"
              ? "text-[#0b4a8b] bg-[#edf4fc] font-extrabold"
              : "text-[#64748b] hover:text-[#111827] font-semibold"
          }`}
        >
          <SettingsIcon className="h-[18px] w-[18px] pointer-events-none shrink-0" />
          <span className="text-[10px] leading-none pointer-events-none truncate">
            Settings
          </span>
        </button>
      </nav>

      {/* REUSABLE IN-APP CONFIRMATION DIALOG */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[80] flex items-center justify-center p-4 font-sans">
          <div className="bg-white border border-[#e6eaf0] rounded-2xl max-w-sm w-full p-5 text-[#111827] space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#fff8e6] text-[#f59e0b] flex items-center justify-center shrink-0 border border-[#fde6b0]">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#111827] leading-tight">
                  {confirmDialog.title}
                </h3>
                <p className="text-xs text-[#64748b] mt-1 leading-relaxed">
                  {confirmDialog.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f1f5f9]">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={isConfirmingAction}
                className="px-4 py-2 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsConfirmingAction(true);
                  try {
                    await confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  } finally {
                    setIsConfirmingAction(false);
                  }
                }}
                disabled={isConfirmingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isConfirmingAction ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{confirmDialog.confirmLabel}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET ALL BLOCKS CONFIRMATION MODAL */}
      {showResetBlockConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[80] flex items-center justify-center p-4 font-sans">
          <div className="bg-white border border-[#e6eaf0] rounded-2xl max-w-sm w-full p-5 text-[#111827] space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#111827] leading-tight">
                  Confirm Reset All Blocks
                </h3>
                <p className="text-[11px] text-[#64748b] font-medium">
                  All system blocks will be lifted in one click
                </p>
              </div>
            </div>

            <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-xl p-3.5 space-y-1.5 text-xs text-[#78350f] leading-relaxed">
              <p className="font-extrabold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-[#f59e0b] shrink-0" />
                <span>Are you sure you want to remove all blocks?</span>
              </p>
              <p className="text-[11px] text-[#92400e]">
                Clicking <strong>&ldquo;OK, Reset All Blocks&rdquo;</strong> will permanently clear all blocked IPs, Device IDs, and User IDs so everyone can join meetings again without restrictions.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowResetBlockConfirm(false)}
                disabled={isResettingAllBlocks}
                className="px-4 py-2 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetAllBlocks}
                disabled={isResettingAllBlocks}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResettingAllBlocks ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>OK, Reset All Blocks</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
