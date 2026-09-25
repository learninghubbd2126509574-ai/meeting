import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import * as dbService from "../dbService";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  AlertCircle,
  User,
  Loader2,
  CheckCircle,
  ShieldAlert,
  Bell,
  Clock,
  Calendar,
  AlertTriangle,
  Lock,
  ArrowRight,
  ShieldCheck,
  Video,
} from "lucide-react";
import { motion } from "motion/react";

function getBrowserFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language || "bn",
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || "unknown",
    navigator.maxTouchPoints || "unknown",
  ];
  const rawString = parts.join("|");
  let hash = 0;
  for (let i = 0; i < rawString.length; i++) {
    const char = rawString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return "fp_" + Math.abs(hash).toString(16);
}

interface JoinPageProps {
  meetingId: string;
}

export default function JoinPage({ meetingId }: JoinPageProps) {
  const [fullName, setFullName] = useState("");
  const [ipAddress, setIpAddress] = useState<string>("যাচাই হচ্ছে...");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [isIpBlocked, setIsIpBlocked] = useState<boolean>(false);
  const [isDeviceBlockedById, setIsDeviceBlockedById] = useState<boolean>(false);
  const [isDeviceBlockedByFp, setIsDeviceBlockedByFp] = useState<boolean>(false);
  const [isUidBlocked, setIsUidBlocked] = useState<boolean>(false);
  const [isVPN, setIsVPN] = useState<boolean>(false);

  const isBlocked =
    isIpBlocked ||
    isDeviceBlockedById ||
    isDeviceBlockedByFp ||
    isUidBlocked ||
    isVPN;

  const [alreadyJoined, setAlreadyJoined] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [googleMeetLink, setGoogleMeetLink] = useState<string | null>(() => {
    try {
      const cached = localStorage.getItem(`ue_meet_${meetingId}`);
      if (cached) return JSON.parse(cached).googleMeetLink || null;
    } catch {}
    return null;
  });

  const [meetingActive, setMeetingActive] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem(`ue_meet_${meetingId}`);
      if (cached) return JSON.parse(cached).active !== false;
    } catch {}
    return true;
  });

  const [meetingDate, setMeetingDate] = useState<string | null>(() => {
    try {
      const cached = localStorage.getItem(`ue_meet_${meetingId}`);
      if (cached) return JSON.parse(cached).meetingDate || null;
    } catch {}
    return null;
  });

  const [meetingTime, setMeetingTime] = useState<string | null>(() => {
    try {
      const cached = localStorage.getItem(`ue_meet_${meetingId}`);
      if (cached) return JSON.parse(cached).meetingTime || null;
    } catch {}
    return null;
  });

  const [noticeText, setNoticeText] = useState<string>("");
  const [noticeActive, setNoticeActive] = useState<boolean>(false);
  const [preventRepeatJoins, setPreventRepeatJoins] = useState<boolean>(true);
  const [publicLinkActive, setPublicLinkActive] = useState<boolean>(true);

  // Notification Popup State
  const [showNotificationPopup, setShowNotificationPopup] = useState<boolean>(true);

  // Demo flow states
  const [demoModeActive, setDemoModeActive] = useState<boolean>(false);
  const [demoCode, setDemoCode] = useState<string>("1234");
  const [demoModeStep, setDemoModeStep] = useState<"enter_code" | "enter_info" | null>(null);
  const [demoEnteredCode, setDemoEnteredCode] = useState<string>("");
  const [demoNameInput, setDemoNameInput] = useState<string>("");
  const [demoGmailInput, setDemoGmailInput] = useState<string>("");
  const [demoError, setDemoError] = useState<string | null>(null);
  const [isDemoSubmitting, setIsDemoSubmitting] = useState<boolean>(false);

  // 1. Live Listeners for Meeting, Block Status, and Settings
  useEffect(() => {
    let unsubMeeting: (() => void) | null = null;
    let unsubDbMeetings: (() => void) | null = null;
    let unsubBlockDevice: (() => void) | null = null;
    let unsubBlockUid: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    async function getIpWithTimeout(): Promise<string> {
      const endpoints = [
        "https://api.ipify.org?format=json",
        "https://api64.ipify.org?format=json",
        "https://ipinfo.io/json",
        "https://ipapi.co/json/",
        "https://api.db-ip.com/v2/free/self",
        "https://api.ipify.org"
      ];

      const fetchWithTimeout = (url: string, ms: number): Promise<string> => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => reject(new Error("Timeout")), ms);
          fetch(url)
            .then((res) => {
              if (res.ok) return res.text();
              throw new Error("Network error");
            })
            .then((text) => {
              clearTimeout(timeoutId);
              const trimmed = text.trim();
              if (!trimmed) {
                reject(new Error("Empty response"));
                return;
              }
              try {
                const data = JSON.parse(trimmed);
                const ip = data.ip || data.ipAddress || data.query;
                if (ip) {
                  resolve(ip);
                } else {
                  reject(new Error("No IP key in JSON"));
                }
              } catch (e) {
                if (/^[0-9a-fA-F.:]+$/.test(trimmed)) {
                  resolve(trimmed);
                } else {
                  reject(new Error("Invalid text IP format"));
                }
              }
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              reject(err);
            });
        });
      };

      const promises = endpoints.map((url) => fetchWithTimeout(url, 5000));

      try {
        if (typeof Promise.any === "function") {
          return await Promise.any(promises);
        } else {
          return await new Promise<string>((resolve) => {
            let resolved = false;
            let rejectCount = 0;
            promises.forEach((p) => {
              p.then((ip) => {
                if (!resolved) {
                  resolved = true;
                  resolve(ip);
                }
              }).catch(() => {
                rejectCount++;
                if (rejectCount === promises.length) {
                  resolve("Unknown");
                }
              });
            });
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve("Unknown");
              }
            }, 6000);
          });
        }
      } catch (err) {
        console.warn("Resilient IP fetch failed, using fallback.", err);
        return "Unknown";
      }
    }

    async function setupListeners() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        await new Promise<void>((resolve) => {
          const unsubscribe = onAuthStateChanged(auth, () => {
            unsubscribe();
            resolve();
          });
          setTimeout(() => {
            unsubscribe();
            resolve();
          }, 1500);
        });

        // Initialize persistent device & UID
        let curDevId = localStorage.getItem("ue_device_id");
        if (!curDevId) {
          curDevId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          localStorage.setItem("ue_device_id", curDevId);
        }
        setDeviceId(curDevId);

        let curUid = localStorage.getItem("ue_user_uid");
        if (!curUid) {
          curUid = Math.floor(100000 + Math.random() * 900000).toString();
          localStorage.setItem("ue_user_uid", curUid);
        }
        setUid(curUid);

        // Fetch user IP
        const userIp = await getIpWithTimeout();
        setIpAddress(userIp);

        // Check if IP or UID or Device is blocked
        if (userIp && userIp !== "Unknown") {
          try {
            const isBlockedByIp = await dbService.isIPBlocked(userIp);
            if (isBlockedByIp) setIsIpBlocked(true);
          } catch (e) {}
        }

        if (curDevId) {
          try {
            const isBlockedByDev = await dbService.isDeviceBlocked(curDevId);
            if (isBlockedByDev) setIsDeviceBlockedById(true);
          } catch (e) {}
        }

        if (curUid) {
          try {
            const isBlockedByUid = await dbService.isUIDBlocked(curUid);
            if (isBlockedByUid) setIsUidBlocked(true);
          } catch (e) {}
        }

        // Live Supabase / Firestore Listeners
        unsubDbMeetings = dbService.subscribeMeetings((list) => {
          const found = list.find((m) => m.id === meetingId);
          if (found) {
            setGoogleMeetLink(found.googleMeetLink);
            setMeetingActive(found.active !== false);
            if (found.meetingDate) setMeetingDate(found.meetingDate);
            if (found.meetingTime) setMeetingTime(found.meetingTime);
            try {
              localStorage.setItem(`ue_meet_${meetingId}`, JSON.stringify(found));
            } catch (e) {}
          }
        });

        unsubSettings = dbService.subscribeAdminSettings((settings) => {
          if (settings) {
            if (settings.noticeText !== undefined) setNoticeText(settings.noticeText);
            if (settings.noticeActive !== undefined) setNoticeActive(settings.noticeActive);
            if (settings.preventRepeatJoins !== undefined) setPreventRepeatJoins(settings.preventRepeatJoins);
            if (settings.publicLinkActive !== undefined) setPublicLinkActive(settings.publicLinkActive);
            if (settings.demoModeActive !== undefined) setDemoModeActive(settings.demoModeActive);
            if (settings.demoCode) setDemoCode(settings.demoCode);
          }
        });

        const meetRef = doc(db, "meetings", meetingId);
        unsubMeeting = onSnapshot(meetRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setGoogleMeetLink(data.googleMeetLink);
            setMeetingActive(data.active !== false);
            if (data.meetingDate) setMeetingDate(data.meetingDate);
            if (data.meetingTime) setMeetingTime(data.meetingTime);
            try {
              localStorage.setItem(`ue_meet_${meetingId}`, JSON.stringify(data));
            } catch (e) {}
          }
        });

        setIsLoading(false);
      } catch (err: any) {
        console.warn("Setup listeners caught:", err);
        setIsLoading(false);
      }
    }

    setupListeners();

    return () => {
      if (unsubMeeting) unsubMeeting();
      if (unsubDbMeetings) unsubDbMeetings();
      if (unsubBlockDevice) unsubBlockDevice();
      if (unsubBlockUid) unsubBlockUid();
      if (unsubSettings) unsubSettings();
    };
  }, [meetingId]);

  useEffect(() => {
    if (!deviceId || deviceId === "Unknown") {
      setIsDeviceBlockedById(false);
      return;
    }

    const unsubBlockDevice = dbService.subscribeBlockedDevices((list) => {
      setIsDeviceBlockedById(list.some((b) => b.deviceId === deviceId));
    });

    return () => {
      unsubBlockDevice();
    };
  }, [deviceId]);

  useEffect(() => {
    if (!uid || uid === "Unknown") {
      setIsUidBlocked(false);
      return;
    }

    const unsubBlockUid = dbService.subscribeBlockedUIDs((list) => {
      setIsUidBlocked(list.some((b) => b.uid === uid));
    });

    return () => {
      unsubBlockUid();
    };
  }, [uid]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    if (!publicLinkActive) {
      setErrorMessage(
        "দুঃখিত, সাধারণ লিংকের মাধ্যমে জয়েন করা বর্তমানে বন্ধ রাখা হয়েছে।",
      );
      return;
    }

    if (!googleMeetLink) {
      setErrorMessage(
        "গুগল মিট (Google Meet) লিংকটি এখনও কাউন্সেলিং সেশনে যুক্ত করা হয়নি।",
      );
      return;
    }

    if (!meetingActive) {
      setErrorMessage(
        "এই কাউন্সেলিং সেশনটি বৰ্তমানে নিষ্ক্রিয় বা সম্পন্ন করা হয়েছে।",
      );
      return;
    }

    const finalIp =
      !ipAddress || ipAddress === "যাচাই হচ্ছে..." ? "Unknown" : ipAddress;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (isBlocked) {
        setIsSubmitting(false);
        return;
      }

      if (finalIp && finalIp !== "Unknown") {
        try {
          if (await dbService.isIPBlocked(finalIp)) {
            setIsIpBlocked(true);
            setIsSubmitting(false);
            return;
          }
        } catch (e) {}
      }

      if (deviceId && deviceId !== "Unknown") {
        try {
          if (await dbService.isDeviceBlocked(deviceId)) {
            setIsDeviceBlockedById(true);
            setIsSubmitting(false);
            return;
          }
        } catch (e) {}
      }

      if (uid && uid !== "Unknown") {
        try {
          if (await dbService.isUIDBlocked(uid)) {
            setIsUidBlocked(true);
            setIsSubmitting(false);
            return;
          }
        } catch (e) {}
      }

      if (preventRepeatJoins && finalIp && finalIp !== "Unknown") {
        try {
          const parts = await dbService.getParticipants();
          const duplicate = parts.find(
            (p) => p.meetingId === meetingId && p.ip === finalIp && p.deviceId !== deviceId
          );

          if (duplicate) {
            setErrorMessage(
              "দুঃখিত, এই আইপি অ্যাড্রেস (IP Address) দিয়ে ইতিপূর্বে অন্য একটি ডিভাইস থেকে মিটিংয়ে জয়েন করা হয়েছে। একই ওয়াইফাই বা ইন্টারনেট সংযোগ দিয়ে দ্বিতীয় কেউ মিটিংয়ে অংশগ্রহণ করতে পারবেন না।",
            );
            setIsSubmitting(false);
            return;
          }
        } catch (errSameIp) {}
      }

      const participantId = `part_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      try {
        await dbService.saveParticipant({
          id: participantId,
          name: fullName.trim(),
          meetingId: meetingId,
          ip: finalIp,
          deviceId: deviceId || "Unknown",
          uid: uid || "Unknown",
          browserFingerprint: getBrowserFingerprint(),
          userAgent: navigator.userAgent || "Unknown Browser",
          joinedAt: new Date().toISOString(),
          blocked: false,
        });
      } catch (err: any) {}

      let currentMeetLink = googleMeetLink;
      let currentMeetingActive = meetingActive;

      try {
        const freshMeeting = await dbService.getMeetingById(meetingId);
        if (freshMeeting) {
          if (freshMeeting.googleMeetLink) {
            currentMeetLink = freshMeeting.googleMeetLink;
          }
          if (freshMeeting.active !== undefined) {
            currentMeetingActive = freshMeeting.active !== false;
          }
        }
      } catch (fetchErr) {}

      if (!currentMeetLink || !currentMeetLink.trim()) {
        try {
          await new Promise((r) => setTimeout(r, 600));
          const retrySnap = await getDoc(doc(db, "meetings", meetingId));
          if (retrySnap.exists() && retrySnap.data().googleMeetLink) {
            currentMeetLink = retrySnap.data().googleMeetLink;
            if (retrySnap.data().active !== undefined) {
              currentMeetingActive = retrySnap.data().active !== false;
            }
          }
        } catch (e) {}
      }

      if (!currentMeetingActive) {
        setErrorMessage(
          "এই কাউন্সেলিং সেশনটি বৰ্তমানে নিষ্ক্রিয় বা সম্পন্ন করা হয়েছে।",
        );
        setIsSubmitting(false);
        return;
      }

      if (!currentMeetLink || !currentMeetLink.trim()) {
        setErrorMessage(
          "গুগল মিট (Google Meet) লিংকটি লোড হচ্ছে। অনুগ্রহ করে আবার 'মিটিংয়ে প্রবেশ করুন' এ ক্লিক করুন।",
        );
        setIsSubmitting(false);
        return;
      }

      let redirectUrl = currentMeetLink.trim();
      if (!/^https?:\/\//i.test(redirectUrl)) {
        redirectUrl = "https://" + redirectUrl;
      }

      window.location.assign(redirectUrl);
    } catch (err: any) {
      console.error("Global join error:", err);
      setErrorMessage(
        "সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। অনুগ্রহ করে ইন্টারনেট চেক করে আবার চেষ্টা করুন।",
      );
      setIsSubmitting(false);
    }
  }

  function handleDemoCodeVerify(e: React.FormEvent) {
    e.preventDefault();
    setDemoError(null);
    if (demoEnteredCode === demoCode) {
      setDemoModeStep("enter_info");
    } else {
      setDemoError(
        "ভুল ডেমো কোড! অনুগ্রহ করে আপনার অ্যাডমিন কর্তৃক সেট করা কোডটি সঠিকভাবে দিন।",
      );
    }
  }

  async function handleDemoJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!demoNameInput.trim()) {
      setDemoError("আপনার সম্পূর্ণ নামটি দেওয়া আবশ্যক।");
      return;
    }

    if (!googleMeetLink) {
      setDemoError(
        "গুগল মিট (Google Meet) লিংকটি এখনও সেশনে যুক্ত করা হয়নি।",
      );
      return;
    }

    if (!meetingActive) {
      setDemoError(
        "এই কাউন্সেলিং সেশনটি বৰ্তমানে নিষ্ক্রিয় বা সম্পন্ন করা হয়েছে।",
      );
      return;
    }

    const finalIp =
      !ipAddress || ipAddress === "যাচাই হচ্ছে..." ? "Unknown" : ipAddress;

    try {
      setIsDemoSubmitting(true);
      setDemoError(null);

      if (isIpBlocked || isDeviceBlockedById || isDeviceBlockedByFp) {
        setIsDemoSubmitting(false);
        setDemoError(
          "দুঃখিত, আইপি বা ডিভাইস ব্লক থাকার কারণে আপনি জয়েন করতে পারছেন না।",
        );
        return;
      }

      if (finalIp && finalIp !== "Unknown") {
        try {
          if (await dbService.isIPBlocked(finalIp)) {
            setIsIpBlocked(true);
            setIsDemoSubmitting(false);
            setDemoError("দুঃখিত, আপনার আইপিটি ব্লকড করা হয়েছে।");
            return;
          }
        } catch (e) {}
      }

      if (deviceId && deviceId !== "Unknown") {
        try {
          if (await dbService.isDeviceBlocked(deviceId)) {
            setIsDeviceBlockedById(true);
            setIsDemoSubmitting(false);
            setDemoError("দুঃখিত, আপনার ডিভাইসটি ব্লকড করা হয়েছে।");
            return;
          }
        } catch (e) {}
      }

      if (uid && uid !== "Unknown") {
        try {
          if (await dbService.isUIDBlocked(uid)) {
            setIsUidBlocked(true);
            setIsDemoSubmitting(false);
            setDemoError("দুঃখিত, আপনার ইউজার আইডি (UID) ব্লকড করা হয়েছে।");
            return;
          }
        } catch (e) {}
      }

      const demoPartId = `dm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      try {
        await dbService.saveDemoParticipant({
          id: demoPartId,
          name: demoNameInput.trim(),
          gmail: demoGmailInput.trim() || "",
          meetingId: meetingId,
          ip: finalIp,
          deviceId: deviceId || "Unknown",
          uid: uid || "Unknown",
          browserFingerprint: getBrowserFingerprint(),
          userAgent: navigator.userAgent || "Unknown Browser",
          joinedAt: new Date().toISOString(),
          blocked: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err: any) {}

      if (!meetingActive) {
        setDemoError(
          "এই কাউন্সেলিং সেশনটি বৰ্তমানে নিষ্ক্রিয় বা সম্পন্ন করা হয়েছে।",
        );
        setIsDemoSubmitting(false);
        return;
      }

      if (!googleMeetLink) {
        setDemoError(
          "গুগল মিট (Google Meet) লিংকটি এখনও সেশনে যুক্ত করা হয়নি।",
        );
        setIsDemoSubmitting(false);
        return;
      }

      let redirectUrl = googleMeetLink.trim();
      if (!/^https?:\/\//i.test(redirectUrl)) {
        redirectUrl = "https://" + redirectUrl;
      }

      window.location.assign(redirectUrl);
    } catch (err: any) {
      console.error("Demo registration error:", err);
      setDemoError("সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। আবার চেষ্টা করুন।");
      setIsDemoSubmitting(false);
    }
  }

  function getMeetingDateAndParts(dateStr?: string | null, timeStr?: string | null) {
    const bgDigits: { [key: string]: string } = {
      "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪",
      "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯",
    };
    const toBgNum = (numStr: string) =>
      numStr
        .split("")
        .map((char) => bgDigits[char] || char)
        .join("");

    let formattedDate = "";
    if (dateStr) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const monthsBg = [
          "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
          "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"
        ];
        const monthIndex = parseInt(month, 10) - 1;
        const monthBg = monthsBg[monthIndex] || month;
        formattedDate = `${toBgNum(day)} ${monthBg} ${toBgNum(year)}`;
      } else {
        formattedDate = dateStr;
      }
    }

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
        formattedTime = `${ampm} ${toBgNum(String(hour))}:${toBgNum(minute)} মিনিট`;
      } else {
        formattedTime = timeStr;
      }
    }

    return {
      formattedDate: formattedDate || "আজকের সেশন",
      formattedTime: formattedTime || "নির্ধারিত সময়",
    };
  }

  const schedule = getMeetingDateAndParts(meetingDate, meetingTime);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-800 flex flex-col justify-center items-center py-4 px-3 sm:py-8 sm:px-4 select-text font-sans">
      
      {/* NOTIFICATION POPUP MODAL */}
      {showNotificationPopup && !isLoading && !isBlocked && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-fadeIn">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden space-y-4 text-center my-auto"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowNotificationPopup(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition cursor-pointer"
              aria-label="Close"
            >
              ✕
            </button>

            {/* Top Icon Badge */}
            <div className="flex justify-center pt-2">
              <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl shadow-inner border border-blue-100">
                📢
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold tracking-wide">
                📌 গুরুত্বপূর্ণ দিকনির্দেশনা
              </span>
            </div>

            {/* Message Box */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left">
              <p className="text-sm font-bold text-slate-800 leading-relaxed text-center">
                সেমিনার মিটিংয়ে প্রবেশ করতে নিচে আপনার নাম লিখুন এবং{" "}
                <span className="text-blue-600 font-extrabold underline decoration-2 underline-offset-2">
                  “মিটিংয়ে প্রবেশ করুন”
                </span>{" "}
                বাটনে ক্লিক করুন।
              </p>
            </div>

            {/* Acknowledge Button */}
            <button
              type="button"
              onClick={() => setShowNotificationPopup(false)}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 transition text-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4 text-white shrink-0" />
              <span>ঠিক আছে, প্রবেশ করুন</span>
            </button>
          </motion.div>
        </div>
      )}

      {/* DEMO MODE MODAL OVERLAY */}
      {demoModeStep !== null && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[90] flex items-center justify-center p-4 animate-fadeIn">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden space-y-4 my-auto"
          >
            <button
              type="button"
              onClick={() => {
                setDemoModeStep(null);
                setDemoEnteredCode("");
                setDemoNameInput("");
                setDemoGmailInput("");
                setDemoError(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center space-y-1.5 pt-1">
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                ডেমো ইউজার পোর্টাল
              </span>
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">
                ইউনিক ডেমো সাইন-ইন
              </h3>
              <p className="text-xs text-slate-500">
                অ্যাডমিন কর্তৃক নির্ধারিত কোড দিয়ে প্রবেশ করুন।
              </p>
            </div>

            {demoError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-700 font-bold text-xs leading-relaxed text-center">
                ⚠️ {demoError}
              </div>
            )}

            {demoModeStep === "enter_code" && (
              <form onSubmit={handleDemoCodeVerify} className="space-y-4">
                <div className="space-y-2 text-center">
                  <label className="text-xs font-bold text-slate-600 block">
                    ৪ সংখ্যার কোড টাইপ করুন
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    placeholder="••••"
                    value={demoEnteredCode}
                    onChange={(e) =>
                      setDemoEnteredCode(e.target.value.replace(/\D/g, ""))
                    }
                    className="w-36 mx-auto text-center px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-2xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 transition shadow-inner"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition text-xs cursor-pointer"
                >
                  কোড ভেরিফাই করুন
                </button>
              </form>
            )}

            {demoModeStep === "enter_info" && (
              <form onSubmit={handleDemoJoin} className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      আপনার সম্পূর্ণ নাম
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="যেমন: মোঃ সাকিব হাসান"
                      value={demoNameInput}
                      onChange={(e) => setDemoNameInput(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isDemoSubmitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition text-xs cursor-pointer flex items-center justify-center gap-2"
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
          </motion.div>
        </div>
      )}

      {/* MAIN RESPONSIVE APP-CONTAINER */}
      <div className="w-full max-w-lg mx-auto bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col">
        
        {/* Top Accent Gradient Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600" />

        {/* LOADING STATE */}
        {isLoading && (
          <div className="py-24 px-6 flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shadow-inner">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-slate-900 font-bold text-sm">
                ডিভাইস ভেরিফিকেশন চলছে...
              </p>
              <p className="text-slate-500 text-xs">
                নিরাপত্তা ব্যবস্থা এবং আইপি অ্যাড্রেস সংযোগ পরীক্ষা হচ্ছে
              </p>
            </div>
          </div>
        )}

        {/* BLOCKED STATE SCREEN */}
        {!isLoading && isBlocked && (
          <div className="p-6 sm:p-8 space-y-6 text-center">
            <div className="h-16 w-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
              <ShieldAlert className="h-8 w-8" />
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl font-black text-rose-600 tracking-tight">
                অ্যাক্সেস ব্লকড!
              </h1>

              {isVPN ? (
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed font-medium">
                  নিরাপত্তা জনিত কারণে{" "}
                  <strong className="text-rose-600 underline">
                    VPN বা প্রক্সি (Proxy Network)
                  </strong>{" "}
                  ব্যবহার করে মিটিংয়ে জয়েন করা সম্পূর্ণরূপে নিষিদ্ধ। অনুগ্রহ
                  করে আপনার আসল ওয়াইফাই বা মোবাইল ইন্টারনেট ব্যবহার করুন।
                </p>
              ) : (
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed font-medium">
                  দুঃখিত, আমাদের সিকিউরিটি ফিল্টার আপনার{" "}
                  <strong className="text-rose-600">
                    ডিভাইস আইপি অথবা হার্ডওয়্যার আইডি
                  </strong>{" "}
                  ব্লক করেছে। আপনি আর এই মিটিং সেশনের জন্য অ্যাক্সেস পাবেন না।
                </p>
              )}

              <div className="bg-slate-50 border border-slate-200/90 p-4 rounded-xl font-mono text-xs text-slate-700 text-left space-y-2">
                <p className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="font-semibold text-slate-500">IP ADDRESS:</span>
                  <span className="text-rose-600 font-bold">{ipAddress}</span>
                </p>
                <p className="flex justify-between pt-0.5">
                  <span className="font-semibold text-slate-500">USER ID (UID):</span>
                  <span className="text-blue-600 font-bold">{uid || "Unknown"}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* MARQUEE ANNOUNCEMENT BAR */}
        {!isLoading && !isBlocked && noticeActive && noticeText.trim() && (
          <div className="w-full bg-slate-900 text-white py-2.5 px-4 overflow-hidden flex items-center gap-2 select-none shrink-0 border-b border-slate-800">
            <span className="inline-flex items-center gap-1 bg-emerald-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-black shrink-0 uppercase tracking-wide">
              <Bell className="h-3 w-3 shrink-0" />
              <span>ঘোষণা</span>
            </span>

            <div className="flex-1 overflow-hidden flex items-center h-5">
              <marquee
                scrollamount="3"
                direction="left"
                className="text-xs font-semibold text-white/95 w-full"
              >
                {noticeText} &nbsp;&nbsp;&nbsp;&nbsp; ★ &nbsp;&nbsp;&nbsp;&nbsp; {noticeText}
              </marquee>
            </div>
          </div>
        )}

        {/* ACTIVE MEETING FORM CONTENT */}
        {!isLoading && !isBlocked && (
          <div className="p-5 sm:p-7 space-y-6">
            
            {/* Header / Brand Area */}
            <div className="text-center space-y-3">
              <div
                onClick={() => {
                  setDemoModeStep("enter_code");
                  setDemoEnteredCode("");
                  setDemoNameInput("");
                  setDemoGmailInput("");
                  setDemoError(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200/80 text-emerald-700 rounded-full text-xs font-bold tracking-wide select-none cursor-pointer hover:bg-emerald-100 transition"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>সেশন লাইভ পোর্টাল</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                UNITY <span className="text-blue-600">EARNING</span>
              </h1>
              
              <p className="text-xs sm:text-sm font-semibold text-slate-500 tracking-wide">
                অফিসিয়াল সেশন অনবোর্ডিং পোর্টাল
              </p>
            </div>

            {/* UNIFIED SCHEDULE CARD */}
            <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span>সেশন সময়সূচি</span>
                </div>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase">
                  অফিসিয়াল
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Date */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold mb-1">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                    <span>তারিখ</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">
                    {schedule.formattedDate}
                  </span>
                </div>

                {/* Time */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold mb-1">
                    <Clock className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                    <span>সময়</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">
                    {schedule.formattedTime}
                  </span>
                </div>
              </div>
            </div>

            {/* ALERTS & SYSTEM STATUS */}
            {errorMessage && !errorMessage.includes("কোটা") && !errorMessage.includes("Quota") && !errorMessage.includes("ফায়ারবেস") && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-rose-800 font-bold leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            )}

            {!meetingActive && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-amber-800 font-semibold leading-relaxed">
                  এই কাউন্সেলিং সেশনটি বৰ্তমানে অ্যাডমিন কর্তৃক নিষ্ক্রিয় রাখা হয়েছে। মিটিং লিংক অন না করা পর্যন্ত অপেক্ষা করুন।
                </p>
              </div>
            )}

            {!publicLinkActive && (
              <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-5 text-center space-y-2">
                <div className="mx-auto w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center text-rose-600">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <h3 className="font-extrabold text-sm text-rose-900">
                  ⚠️ জয়েনিং অপশন বর্তমানে বন্ধ রয়েছে
                </h3>
                <p className="text-xs text-rose-700 font-medium leading-relaxed">
                  এডমিন জয়েন করার অপশন অন করার সাথে সাথে নাম টাইপ করার বক্সটি এখানে সচল হবে। অনুগ্রহ করে অপেক্ষা করুন।
                </p>
              </div>
            )}

            {/* NAME INPUT & JOIN ACTION FORM */}
            <form onSubmit={handleJoin} className="space-y-4">
              {publicLinkActive && (
                <div className="bg-slate-50/90 rounded-2xl p-4 sm:p-5 border-2 border-emerald-500 shadow-sm space-y-3.5 animate-input-glow">
                  
                  {/* Field Header */}
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-slate-900 font-black text-sm flex items-center gap-1.5">
                          আপনার সঠিক নাম লিখুন
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        </span>
                        <p className="text-[11px] text-slate-500 font-medium">অফিসিয়াল হাজিরা ও অনবোর্ডিং এর জন্য বাধ্যতামূলক</p>
                      </div>
                    </div>
                  </div>

                  {/* Input Element with Clear High Contrast & Highlight */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="আপনার নাম এখানে লিখুন..."
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 rounded-xl text-base font-bold transition shadow-xs"
                    />
                    <span className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none">
                      {fullName.trim() ? (
                        <span className="h-5 w-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-xs">
                          ✓
                        </span>
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70 animate-ping" />
                      )}
                    </span>
                  </div>

                  {/* Gentle Warning */}
                  <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200/80 px-3 py-2 rounded-xl text-xs font-semibold">
                    <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                    <span>নাম ভুল হলে মিটিং থেকে সরাসরি বের করে দেয়া হতে পারে।</span>
                  </div>
                </div>
              )}

              {/* HIGH VISIBILITY ACTION BUTTON */}
              <div>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !fullName.trim() ||
                    ipAddress === "যাচাই হচ্ছে..." ||
                    !publicLinkActive
                  }
                  className={`w-full py-4 px-6 text-white font-black rounded-2xl transition duration-150 cursor-pointer text-center flex items-center justify-center gap-2 text-base shadow-lg ${
                    publicLinkActive
                      ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/30 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none animate-btn-pulse"
                      : "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                  }`}
                >
                  {ipAddress === "যাচাই হচ্ছে..." ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                      <span>নিরাপত্তা ভেরিফাই করা হচ্ছে...</span>
                    </div>
                  ) : isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                      <span>লিঙ্ক রিকোয়েস্ট হচ্ছে, অপেক্ষা করুন...</span>
                    </div>
                  ) : !publicLinkActive ? (
                    <div className="flex items-center justify-center gap-2">
                      <AlertCircle className="h-5 w-5 text-white" />
                      <span>জয়েনিং সেশন অ্যাডমিন কর্তৃক নিষ্ক্রিয়</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-5 w-5 text-white" strokeWidth={2.5} />
                      <span>মিটিংয়ে প্রবেশ করুন</span>
                    </div>
                  )}
                </button>
              </div>

              {/* COUNSELLING RULES LIST */}
              <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-5 space-y-3.5">
                <div className="flex items-center gap-2 font-black text-xs text-slate-900 border-b border-slate-200/80 pb-2.5">
                  <AlertCircle className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>কাউন্সেলিং সেশন রুলস:</span>
                </div>

                <ul className="space-y-3 text-xs sm:text-[13px] text-slate-700 font-semibold leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold mt-0.5">
                      ১
                    </span>
                    <span>
                      মিটিংয়ে ঢুকেই প্রথম একটি{" "}
                      <strong className="text-rose-600 underline font-bold">
                        স্ক্রিনশট (Screenshot)
                      </strong>{" "}
                      নিয়ে কাউন্সেলরকে ইনবক্স করুন।
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold mt-0.5">
                      ২
                    </span>
                    <span>
                      সেশনের সমস্ত নিয়মনীতি মেনে সম্পূর্ণ সময় মিটিংয়ে থাকা আবশ্যক।
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold mt-0.5">
                      ৩
                    </span>
                    <span>
                      মাঝখানে চলে গেলে পুনরায় জয়েন রিকোয়েস্ট এক্সেপ্ট করা হবে না।
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold mt-0.5">
                      ৪
                    </span>
                    <span>
                      মিটিং চলাকালীন ফোনের কোনো প্রকার কলে কথা বলা যাবে না।
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold mt-0.5">
                      ৫
                    </span>
                    <span>
                      ১০ মিনিট জয়েনিং টাইম চলবে এবং পুরো মিটিংটি সর্বোচ্চ ৪০ মিনিট হবে।
                    </span>
                  </li>
                </ul>
              </div>
            </form>

            {/* SECURE FOOTER BAR */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-500 font-medium">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <Lock className="h-3.5 w-3.5 text-emerald-600" />
                <span>নিরাপদ এনক্রিপ্টেড সংযোগ</span>
              </div>
              <span className="font-mono text-[11px] text-slate-700 font-bold">
                IP: {ipAddress === "Unknown" ? "যাচাই করা সম্ভব হয়নি" : ipAddress}
              </span>
            </div>

          </div>
        )}

      </div>

      <p className="text-center text-xs text-slate-400 mt-5 font-medium">
        © {new Date().getFullYear()} Unity Earning. সর্বস্বত্ব সংরক্ষিত।
      </p>

    </div>
  );
}
