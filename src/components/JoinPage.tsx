import React, { useState, useEffect } from "react";
import { db, auth, handleFirestoreError, OperationType } from "../firebase";
import * as dbService from "../dbService";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
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
  Sparkles,
  ArrowRight,
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
  const [isDeviceBlockedById, setIsDeviceBlockedById] =
    useState<boolean>(false);
  const [isDeviceBlockedByFp, setIsDeviceBlockedByFp] =
    useState<boolean>(false);
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
  const [demoModeStep, setDemoModeStep] = useState<
    "enter_code" | "enter_info" | null
  >(null);
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
    let unsubBlockFp: (() => void) | null = null;
    let unsubBlockUid: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    // Fast parallel IP fetching with timeout to guarantee responsiveness under slow connections
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

        const ua = navigator.userAgent || "";
        const isInApp = /Telegram|FBAN|FBAV|Instagram|WhatsApp|Messenger/i.test(ua);
        console.log("Client Environment Diagnostics:", {
          userAgent: ua,
          isInAppBrowser: isInApp,
          meetingId,
          timestamp: new Date().toISOString(),
          url: window.location.href
        });

        await new Promise<void>((resolve) => {
          const unsubscribe = onAuthStateChanged(auth, (user) => {
            console.log("Firebase Auth State Resolved in JoinPage:", {
              uid: user?.uid,
              isAnonymous: user?.isAnonymous,
              email: user?.email
            });
            unsubscribe();
            resolve();
          });
          setTimeout(() => {
            unsubscribe();
            console.warn("Firebase Auth State Timeout (1500ms) reached - proceeding with public/anonymous access fallback.");
            resolve();
          }, 1500);
        });

        let dId = localStorage.getItem("unity_device_id");
        if (!dId) {
          const cookieMatch = document.cookie.match(
            /(?:^|; )unity_device_id=([^;]*)/,
          );
          if (cookieMatch) {
            dId = decodeURIComponent(cookieMatch[1]);
          }
        }
        if (!dId) {
          dId = sessionStorage.getItem("unity_device_id");
        }
        if (!dId) {
          dId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        }
        localStorage.setItem("unity_device_id", dId);
        sessionStorage.setItem("unity_device_id", dId);
        document.cookie = `unity_device_id=${encodeURIComponent(dId)}; max-age=315360000; path=/; SameSite=Lax`;
        setDeviceId(dId);

        let uId = localStorage.getItem("unity_uid");
        if (!uId) {
          const cookieMatch = document.cookie.match(
            /(?:^|; )unity_uid=([^;]*)/,
          );
          if (cookieMatch) {
            uId = decodeURIComponent(cookieMatch[1]);
          }
        }
        if (!uId) {
          uId = sessionStorage.getItem("unity_uid");
        }
        if (!uId) {
          uId = `UID-${100000 + Math.floor(Math.random() * 900000)}`;
        }
        localStorage.setItem("unity_uid", uId);
        sessionStorage.setItem("unity_uid", uId);
        document.cookie = `unity_uid=${encodeURIComponent(uId)}; max-age=315360000; path=/; SameSite=Lax`;
        setUid(uId);

        const detectedIp = await getIpWithTimeout();
        setIpAddress(detectedIp);

        if (detectedIp !== "Unknown" && detectedIp !== "যাচাই হচ্ছে...") {
          fetch(`https://ipapi.co/${detectedIp}/json/`)
            .then((res) => res.json())
            .then((meta) => {
              const org = (meta.org || "").toLowerCase();
              const asn = (meta.asn || "").toLowerCase();
              const hostingKeywords = [
                "amazon",
                "google",
                "digitalocean",
                "ovh",
                "linode",
                "vultr",
                "m247",
                "pax8",
                "hosting",
                "datacenter",
                "proxy",
                "vpn",
                "cloudflare",
              ];
              if (
                hostingKeywords.some(
                  (kw) => org.includes(kw) || asn.includes(kw),
                )
              ) {
                setIsVPN(true);
              }
            })
            .catch(() => {});
        }

        if (dId) {
          dbService.isDeviceBlocked(dId).then((blocked) => {
            if (blocked) setIsDeviceBlockedById(true);
          });
        }

        if (uId) {
          dbService.isUIDBlocked(uId).then((blocked) => {
            if (blocked) setIsUidBlocked(true);
          });
        }

        let retryCount = 0;
        const maxRetries = 4;

        async function fetchMeetingWithRetry() {
          try {
            const sMeeting = await dbService.getMeetingById(meetingId);
            if (sMeeting) {
              setGoogleMeetLink(sMeeting.googleMeetLink);
              setMeetingActive(sMeeting.active !== false);
              setMeetingDate(sMeeting.meetingDate || null);
              setMeetingTime(sMeeting.meetingTime || null);
              setErrorMessage(null);
              try {
                localStorage.setItem(`ue_meet_${meetingId}`, JSON.stringify(sMeeting));
              } catch (e) {}
              return;
            }

            try {
              const docRef = doc(db, "meetings", meetingId);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                const mData = docSnap.data();
                setGoogleMeetLink(mData.googleMeetLink);
                setMeetingActive(mData.active !== false);
                setMeetingDate(mData.meetingDate || null);
                setMeetingTime(mData.meetingTime || null);
                setErrorMessage(null);
                try {
                  localStorage.setItem(`ue_meet_${meetingId}`, JSON.stringify(mData));
                } catch (e) {}
                return;
              }
            } catch (firestoreErr) {
              console.warn("Firestore meeting doc fallback notice:", firestoreErr);
            }

            // Check dbService.getMeetings() which includes persistent LocalStorage cache
            const allMeetings = await dbService.getMeetings();
            if (allMeetings && allMeetings.length > 0) {
              const foundMeeting = allMeetings.find((m) => m.id === meetingId) || allMeetings.find((m) => m.active !== false) || allMeetings[0];
              if (foundMeeting) {
                setGoogleMeetLink(foundMeeting.googleMeetLink);
                setMeetingActive(foundMeeting.active !== false);
                setMeetingDate(foundMeeting.meetingDate || null);
                setMeetingTime(foundMeeting.meetingTime || null);
                setErrorMessage(null);
                try {
                  const newUrl = `/?join=${foundMeeting.id}`;
                  window.history.replaceState({ page: 'join', id: foundMeeting.id }, '', newUrl);
                } catch (e) {}
                return;
              }
            }

            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(fetchMeetingWithRetry, 1200);
            }
          } catch (fetchErr: any) {
            console.warn("fetchMeetingWithRetry notice:", fetchErr);
            const allMeetings = await dbService.getMeetings();
            if (allMeetings && allMeetings.length > 0) {
              const foundMeeting = allMeetings.find((m) => m.id === meetingId) || allMeetings.find((m) => m.active !== false) || allMeetings[0];
              if (foundMeeting) {
                setGoogleMeetLink(foundMeeting.googleMeetLink);
                setMeetingActive(foundMeeting.active !== false);
                setMeetingDate(foundMeeting.meetingDate || null);
                setMeetingTime(foundMeeting.meetingTime || null);
                setErrorMessage(null);
                return;
              }
            }
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(fetchMeetingWithRetry, 1200);
            }
          }
        }

        unsubDbMeetings = dbService.subscribeMeetings((list) => {
          if (list && list.length > 0) {
            const target = list.find((m) => m.id === meetingId) || list.find((m) => m.active !== false) || list[0];
            if (target) {
              setGoogleMeetLink(target.googleMeetLink);
              setMeetingActive(target.active !== false);
              setMeetingDate(target.meetingDate || null);
              setMeetingTime(target.meetingTime || null);
              setErrorMessage(null);
            }
          }
        });

        unsubSettings = dbService.subscribeAdminSettings((sData) => {
          if (sData) {
            setNoticeText(sData.noticeText || "");
            setNoticeActive(sData.noticeActive === true);
            setPreventRepeatJoins(sData.preventRepeatJoins !== false);
            setPublicLinkActive(sData.publicLinkActive !== false);
            setDemoModeActive(sData.demoModeActive === true);
            setDemoCode(sData.demoCode || "1234");
          }
          setIsLoading(false);
        });

        await fetchMeetingWithRetry();
      } catch (err: any) {
        console.error("Initialization error in setupListeners:", err);
        setErrorMessage(
          "নিরাপত্তা ব্যবস্থা যাচাই করতে ব্যর্থ হয়েছে। পেজ রিফ্রেশ করুন।",
        );
        setIsLoading(false);
      }
    }

    const fallbackTimer = setTimeout(() => {
      setIsLoading((current) => {
        if (current) {
          return false;
        }
        return current;
      });
    }, 2000);

    setupListeners();

    return () => {
      clearTimeout(fallbackTimer);
      if (unsubMeeting) unsubMeeting();
      if (unsubDbMeetings) unsubDbMeetings();
      if (unsubBlockDevice) unsubBlockDevice();
      if (unsubBlockFp) unsubBlockFp();
      if (unsubBlockUid) unsubBlockUid();
      if (unsubSettings) unsubSettings();
    };
  }, [meetingId]);

  useEffect(() => {
    if (
      !ipAddress ||
      ipAddress === "যাচাই হচ্ছে..." ||
      ipAddress === "Unknown"
    ) {
      setIsIpBlocked(false);
      return;
    }

    const unsubBlockIP = dbService.subscribeBlockedIPs((list) => {
      setIsIpBlocked(list.some((b) => b.ip === ipAddress));
    });

    return () => {
      unsubBlockIP();
    };
  }, [ipAddress]);

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

  const withTimeout = <T,>(
    promise: Promise<T>,
    timeoutMs: number,
    fallbackValue: T,
  ): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((resolve) =>
        setTimeout(() => resolve(fallbackValue), timeoutMs),
      ),
    ]);
  };

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
          await new Promise(r => setTimeout(r, 600));
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
      formattedDate: formattedDate || "আজকের লাইভ সেশন",
      formattedTime: formattedTime || "নির্ধারিত সময়",
    };
  }

  function formatMeetingDateTime(dateStr?: string | null, timeStr?: string | null) {
    if (!dateStr && !timeStr) return "";
    try {
      const bgDigits: { [key: string]: string } = {
        "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪",
        "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯",
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
          formattedTime = `${ampm} ${toBgNum(String(hour))}:${toBgNum(minute)} মিনিট`;
        } else {
          formattedTime = timeStr;
        }
      }

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

      if (formattedDate && formattedTime) {
        return `${formattedDate}, ${formattedTime}`;
      }
      return formattedDate || formattedTime;
    } catch (e) {
      console.warn("Date parsing error", e);
    }
    return `${dateStr || ""} ${timeStr || ""}`.trim();
  }

  // NEOMORPHISM DESIGN SYSTEM
  // Base background: #eef2f7
  // Raised shadow: shadow-[8px_8px_16px_#d1d9e6,-8px_-8px_16px_#ffffff]
  // Inset shadow: shadow-[inset_3px_3px_6px_#d1d9e6,inset_-3px_-3px_6px_#ffffff]
  // Button shadow: shadow-[5px_5px_12px_#d1d9e6,-5px_-5px_12px_#ffffff]

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e8eef5] text-slate-800 flex flex-col justify-center items-center p-0 sm:p-4 md:p-6 select-text overflow-x-hidden font-sans">
      
      {/* PROFESSIONAL PORTAL CONTAINER */}
      <div className="w-full min-h-screen sm:min-h-0 sm:max-w-[430px] bg-white sm:rounded-[28px] sm:border sm:border-slate-200/90 sm:shadow-[0_20px_60px_-15px_rgba(15,23,42,0.1),0_0_0_1px_rgba(255,255,255,0.8)] flex flex-col relative overflow-hidden transition-all duration-300">
        
        {/* MEETING NOTIFICATION POPUP */}
        {showNotificationPopup && !isLoading && !isBlocked && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[100] flex items-center justify-center p-4 font-sans animate-fade-in">
            <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-100 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.2)] p-6 relative overflow-hidden space-y-4 text-center my-auto transition-all">
              
              {/* TOP RIGHT CLOSE ICON */}
              <button
                type="button"
                onClick={() => setShowNotificationPopup(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition duration-150 cursor-pointer"
                aria-label="Close"
              >
                ✕
              </button>

              {/* EMBOSSED TOP BADGE ICON */}
              <div className="flex justify-center pt-1">
                <div className="h-12 w-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center text-white shadow-[0_8px_16px_-4px_rgba(37,99,235,0.3)]">
                  <span className="text-xl">📢</span>
                </div>
              </div>

              {/* TITLE */}
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200/60 px-3 py-1 rounded-full text-[11px] font-bold text-blue-700 tracking-wide">
                  📌 গুরুত্বপূর্ণ দিকনির্দেশনা
                </span>
              </div>

              {/* MESSAGE CONTENT */}
              <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 space-y-2">
                <p className="text-xs sm:text-[13px] font-semibold text-slate-800 leading-relaxed">
                  সেমিনার মিটিংয়ে প্রবেশ করতে নিচে আপনার নাম লিখুন এবং <span className="text-blue-600 font-bold underline decoration-blue-300 underline-offset-2">“মিটিংয়ে প্রবেশ করুন”</span> বাটনে ক্লিক করুন।
                </p>
              </div>

              {/* CLOSE / CONTINUE BUTTON */}
              <button
                type="button"
                onClick={() => setShowNotificationPopup(false)}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition duration-150 text-[13.5px] cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4 text-white shrink-0" />
                <span>ঠিক আছে, প্রবেশ করুন</span>
              </button>

            </div>
          </div>
        )}

        {/* DEMO MODE MODAL OVERLAY */}
        {demoModeStep !== null && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[90] flex items-center justify-center p-4 font-sans animate-fade-in">
            <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-100 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.2)] p-6 relative overflow-hidden space-y-4 my-auto">
              
              <button
                type="button"
                onClick={() => {
                  setDemoModeStep(null);
                  setDemoEnteredCode("");
                  setDemoNameInput("");
                  setDemoGmailInput("");
                  setDemoError(null);
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition duration-150 cursor-pointer"
              >
                ✕
              </button>

              <div className="text-center space-y-1 pt-1">
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 uppercase">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  ডেমো ইউজার পোর্টাল
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  ইউনিক ডেমো সাইন-ইন
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  অ্যাডমিন কর্তৃক নির্ধারিত কোড দিয়ে প্রবেশ করুন।
                </p>
              </div>

              {demoError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-700 font-bold text-[11px] leading-relaxed text-center">
                  ⚠️ {demoError}
                </div>
              )}

              {demoModeStep === "enter_code" && (
                <form onSubmit={handleDemoCodeVerify} className="space-y-4">
                  <div className="space-y-1.5 text-center">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
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
                      className="w-36 mx-auto text-center px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.25)] transition duration-150 text-[12px] cursor-pointer"
                  >
                    কোড ভেরিফাই করুন
                  </button>
                </form>
              )}

              {demoModeStep === "enter_info" && (
                <form onSubmit={handleDemoJoin} className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block uppercase">
                        আপনার সম্পূর্ণ নাম
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="যেমন: মোঃ সাকিব হাসান"
                        value={demoNameInput}
                        onChange={(e) => setDemoNameInput(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isDemoSubmitting}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-[0_4px_12px_rgba(16,185,129,0.25)] transition duration-150 text-[12px] cursor-pointer flex items-center justify-center gap-2"
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

        {/* LOADING STATE */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 space-y-4 text-center min-h-[500px]">
            <div className="p-4 bg-white rounded-2xl shadow-[0_8px_20px_-4px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
            <div className="space-y-1">
              <p className="text-slate-900 font-bold text-sm">
                ডিভাইস ভেরিফিকেশন চলছে
              </p>
              <p className="text-slate-500 font-medium text-[11px]">
                নিরাপত্তা ব্যবস্থা এবং আইপি অ্যাড্রেস সংযোগ পরীক্ষা হচ্ছে...
              </p>
            </div>
          </div>
        )}

        {/* BLOCKED SCREEN */}
        {!isLoading && isBlocked && (
          <div className="flex-1 flex flex-col justify-between p-6 bg-slate-50 pt-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-5 text-center pt-4"
            >
              <div className="h-16 w-16 bg-rose-50 rounded-2xl border border-rose-100 flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert className="h-8 w-8 text-rose-600" />
              </div>

              <div className="space-y-2.5">
                <h1 className="text-xl font-bold text-rose-600 tracking-tight">
                  অ্যাক্সেস ব্লকড!
                </h1>

                {isVPN ? (
                  <p className="text-slate-600 text-xs leading-relaxed px-2 font-medium">
                    নিরাপত্তা জনিত কারণে{" "}
                    <span className="font-bold text-rose-600 underline">
                      VPN বা প্রক্সি (Proxy Network)
                    </span>{" "}
                    ব্যবহার করে মিটিংয়ে জয়েন করা সম্পূর্ণরূপে নিষিদ্ধ। অনুগ্রহ
                    করে আপনার আসল ওয়াইফাই বা মোবাইল ইন্টারনেট ব্যবহার করুন।
                  </p>
                ) : (
                  <p className="text-slate-600 text-xs leading-relaxed px-2 font-medium">
                    দুঃখিত, আমাদের সিকিউরিটি ফিল্টার আপনার{" "}
                    <span className="font-bold text-rose-600">
                      ডিভাইস আইপি অথবা হার্ডওয়্যার আইডি
                    </span>{" "}
                    ব্লক করেছে। আপনি আর এই মিটিং সেশনের জন্য অ্যাক্সেস পাবেন না।
                  </p>
                )}

                <div className="bg-white border border-slate-200 px-4 py-3 rounded-xl font-mono text-[11px] font-semibold text-slate-700 mt-4 text-left space-y-1.5 shadow-2xs">
                  <p className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span>IP ADDRESS:</span>{" "}
                    <span className="text-rose-600 font-bold">{ipAddress}</span>
                  </p>
                  <p className="flex justify-between pt-0.5">
                    <span>USER ID (UID):</span>{" "}
                    <span className="text-blue-600 font-bold">{uid || "Unknown"}</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* MARQUEE ANNOUNCEMENT */}
        {!isLoading && !isBlocked && noticeActive && noticeText.trim() && (
          <div className="w-full bg-slate-900 text-white py-2 px-4 overflow-hidden flex items-center gap-2 select-none shrink-0 z-40">
            <span className="inline-flex items-center gap-1 bg-emerald-500 text-white px-2 py-0.5 rounded text-[9px] font-bold shrink-0 tracking-wide uppercase leading-none">
              <Bell className="h-3 w-3 shrink-0" />
              <span>ঘোষণা</span>
            </span>

            <div className="flex-1 overflow-hidden flex items-center h-4">
              <marquee
                scrollamount="3"
                direction="left"
                className="text-[11px] font-semibold font-sans whitespace-nowrap text-white/90 w-full"
              >
                {noticeText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ★ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {noticeText}
              </marquee>
            </div>
          </div>
        )}

        {/* MAIN FORM VIEW */}
        {!isLoading && !isBlocked && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col bg-[#f8fafc] relative animate-fade-in space-y-4">

            {/* FORMAL, ELEGANT BRAND CARD WITH SLIM INFO BAR */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-[0_4px_16px_-2px_rgba(15,23,42,0.04)] space-y-3 shrink-0 relative overflow-hidden text-center">
              {/* TOP SLENDER COLOR ACCENT (Blue & Mint) */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500"></div>

              <div className="space-y-1.5 pt-0.5">
                <div
                  onClick={() => {
                    setDemoModeStep("enter_code");
                    setDemoEnteredCode("");
                    setDemoNameInput("");
                    setDemoGmailInput("");
                    setDemoError(null);
                  }}
                  className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 px-3 py-0.5 rounded-full text-[10.5px] font-bold text-emerald-800 tracking-wide select-none cursor-pointer active:scale-95 transition duration-150"
                  title="ডেমো সেশন লগইন"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                  </span>
                  <span>সেশন লাইভ পোর্টাল</span>
                </div>

                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 font-sans">
                  UNITY <span className="text-blue-600">EARNING</span>
                </h1>
                <p className="text-[11.5px] font-semibold text-slate-500">
                  অফিসিয়াল সেশন জয়েনিং পোর্টাল
                </p>
              </div>

              {/* SLIM, ELEGANT, COMPACT DATE & TIME INFO BAR (Requested by User) */}
              {(() => {
                const schedule = getMeetingDateAndParts(meetingDate, meetingTime);
                return (
                  <div className="pt-1 w-full select-none">
                    <div className="flex items-center justify-center gap-2 sm:gap-3 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium shrink-0">
                        <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="font-bold text-slate-800">{schedule.formattedDate}</span>
                      </div>
                      <span className="h-3 w-px bg-slate-200 shrink-0" aria-hidden="true" />
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium shrink-0">
                        <Clock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="font-bold text-emerald-700">{schedule.formattedTime}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* WARNINGS & ALERTS */}
            <div className="space-y-3">
              {errorMessage && !errorMessage.includes("কোটা") && !errorMessage.includes("Quota") && !errorMessage.includes("ফায়ারবেস") && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2 text-left">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-800 font-semibold leading-normal">
                    {errorMessage}
                  </p>
                </div>
              )}

              {!meetingActive && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-left">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-normal font-medium">
                    এই কাউন্সেলিং সেশনটি বৰ্তমানে অ্যাডমিন কর্তৃক নিষ্ক্রিয়
                    রাখা হয়েছে। আপনি আপনার নাম সাবমিট করে রাখতে পারেন, কিন্তু
                    মিটিং লিংক অন না করা পর্যন্ত রিডাইরেক্ট হতে পারবেন না।
                  </p>
                </div>
              )}

              {!publicLinkActive && (
                <div className="bg-white border border-rose-200 rounded-2xl p-4 text-center space-y-2 shadow-sm">
                  <div className="mx-auto w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center">
                    <ShieldAlert className="h-5 w-5 text-rose-600" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-xs text-rose-800 uppercase tracking-wide">
                      ⚠️ জয়েনিং অপশন বর্তমানে বন্ধ রয়েছে
                    </h3>
                    <p className="text-[11px] text-rose-700 font-semibold leading-relaxed">
                      সম্মানিত এডমিন বর্তমানে সাধারণ লিংকের মাধ্যমে নাম লিখে
                      জয়েন করার অপশনটি বন্ধ (অফ) করে রেখেছেন।
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-[10px] font-bold text-rose-600 inline-flex items-center gap-1.5 select-none">
                    <Clock className="h-3 w-3 text-rose-600" />
                    <span>স্ট্যাটাস: অ্যাডমিন কর্তৃক সাধারণ জয়েন নিষ্ক্রিয়</span>
                  </div>
                </div>
              )}

              {/* FORM & INPUT CARD - CLEAN, FORMAL & PROFESSIONAL */}
              <form onSubmit={handleJoin} className="space-y-3.5">
                {publicLinkActive && (
                  <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-[0_4px_16px_-2px_rgba(15,23,42,0.04)] space-y-3.5 relative overflow-hidden text-left">
                    
                    {/* Card Header - Clean, Formatted & Well-Aligned */}
                    <div className="flex items-start gap-2.5 sm:gap-3 border-b border-slate-100 pb-3">
                      <div className="h-8.5 w-8.5 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                        <User className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-slate-900 font-bold text-[13.5px] sm:text-sm leading-tight">
                            আপনার পূর্ণ নাম লিখুন
                          </h3>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full shrink-0">
                            বাধ্যতামূলক
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-1 leading-snug">
                          অফিসিয়াল হাজিরা নিশ্চিত করতে আপনার সঠিক নাম দিন
                        </p>
                      </div>
                    </div>

                    {/* EYE-CATCHING HIGHLIGHTED INPUT BOX */}
                    <div className="relative group">
                      {/* Subtle ambient animated glowing gradient ring behind input box to immediately draw attention */}
                      <div
                        className={`absolute -inset-[1.5px] rounded-2xl bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-500 transition-all duration-300 ${
                          fullName.trim()
                            ? "opacity-40 blur-[1px]"
                            : "opacity-85 blur-[2.5px] animate-pulse"
                        }`}
                      />

                      <div className="relative bg-white rounded-[14px] flex items-center shadow-xs">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                            fullName.trim()
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-blue-50 text-blue-600"
                          }`}>
                            <User className="h-4.5 w-4.5 font-bold" />
                          </div>
                        </div>

                        <input
                          type="text"
                          required
                          placeholder="এখানে আপনার সঠিক নাম লিখুন..."
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full pl-13 pr-10 py-3.5 bg-white border-2 border-transparent focus:border-blue-500 text-slate-900 placeholder:text-slate-400 placeholder:font-medium rounded-[14px] text-xs sm:text-[14px] font-bold focus:outline-none transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        />

                        <span className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none z-10">
                          {fullName.trim() ? (
                            <span className="h-5 w-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-xs">
                              ✓
                            </span>
                          ) : (
                            <span className="flex h-2.5 w-2.5 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Subtle Notice Alert */}
                    <div className="bg-rose-50/70 border border-rose-100 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 select-none">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <p className="text-[10.5px] text-rose-700 font-medium">
                        নাম ভুল হলে মিটিং থেকে সরাসরি বের করে দেয়া হতে পারে।
                      </p>
                    </div>
                  </div>
                )}

                {/* DYNAMICALLY HIGHLIGHTED ACTION BUTTON */}
                <div>
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      !fullName.trim() ||
                      ipAddress === "যাচাই হচ্ছে..." ||
                      !publicLinkActive
                    }
                    className={`w-full py-3.5 font-bold rounded-xl transition-all duration-300 cursor-pointer text-center flex items-center justify-center gap-2 text-xs sm:text-[14px] select-none ${
                      !publicLinkActive
                        ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-70 shadow-none"
                        : fullName.trim()
                        ? "bg-gradient-to-r from-blue-600 via-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 text-white shadow-[0_8px_24px_-4px_rgba(37,99,235,0.45),0_0_15px_rgba(16,185,129,0.3)] scale-[1.01] active:scale-[0.99] ring-2 ring-emerald-400/40"
                        : "bg-slate-100 border border-slate-200 text-slate-400 shadow-none cursor-not-allowed hover:bg-slate-150"
                    }`}
                  >
                    {ipAddress === "যাচাই হচ্ছে..." ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        <span>নিরাপত্তা ভেরিফাই করা হচ্ছে...</span>
                      </div>
                    ) : isSubmitting ? (
                      <div className="flex items-center gap-1.5 text-white">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                        <span>লিঙ্ক রিকোয়েস্ট হচ্ছে, অপেক্ষা করুন...</span>
                      </div>
                    ) : !publicLinkActive ? (
                      <div className="flex items-center justify-center gap-1.5 px-1 text-white">
                        <AlertCircle className="h-4 w-4 text-white" />
                        <span>জয়েনিং সেশন অ্যাডমিন কর্তৃক নিষ্ক্রিয়</span>
                      </div>
                    ) : fullName.trim() ? (
                      <div className="flex items-center justify-center gap-2 px-1">
                        <CheckCircle className="h-4.5 w-4.5 text-white" />
                        <span className="tracking-wide">মিটিংয়ে প্রবেশ করুন</span>
                        <ArrowRight className="h-4 w-4 text-white animate-pulse" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 px-1 text-slate-400">
                        <User className="h-4 w-4 text-slate-400" />
                        <span>প্রথমে উপরে আপনার নাম লিখুন</span>
                      </div>
                    )}
                  </button>
                </div>

                {/* RULES CARD - FORMAL & BALANCED */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-4.5 space-y-2.5 shadow-[0_4px_16px_-2px_rgba(15,23,42,0.04)] text-left">
                  
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 border-b border-slate-100 pb-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <h2>কাউন্সেলিং সেশন রুলস:</h2>
                  </div>

                  <ul className="space-y-2 text-[11px] sm:text-[11.5px] text-slate-600 list-none pl-0 leading-relaxed font-medium">
                    <li className="flex items-start gap-2">
                      <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-[9.5px] font-bold mt-0.5">
                        ১
                      </span>
                      <span>
                        মিটিংয়ে ঢুকেই প্রথম একটি{" "}
                        <strong className="text-slate-900 font-bold underline decoration-rose-300">
                          স্ক্রিনশট (Screenshot)
                        </strong>{" "}
                        নিয়ে কাউন্সেলরকে ইনবক্স করুন।
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-[9.5px] font-bold mt-0.5">
                        ২
                      </span>
                      <span>
                        সেশনের সমস্ত নিয়মনীতি মেনে সম্পূর্ণ সময় মিটিংয়ে থাকা
                        আবশ্যক।
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-[9.5px] font-bold mt-0.5">
                        ৩
                      </span>
                      <span>
                        মাঝখানে চলে গেলে পুনরায় জয়েন রিকোয়েস্ট এক্সেপ্ট করা
                        হবে না।
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-[9.5px] font-bold mt-0.5">
                        ৪
                      </span>
                      <span>
                        মিটিং চলাকালীন ফোনে কোনো প্রকার কলে কথা বলা যাবে না।
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-[9.5px] font-bold mt-0.5">
                        ৫
                      </span>
                      <span>
                        ১০ মিনিট জয়েনিং টাইম চলবে এবং পুরো সেশনটি সর্বোচ্চ ৪০
                        মিনিট হবে।
                      </span>
                    </li>
                  </ul>
                </div>
              </form>
            </div>

            {/* FOOTER VERIFIED SECURITY BADGE */}
            <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-[10.5px] text-slate-500 font-medium select-none shadow-2xs">
              <div className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-emerald-600" />
                <span>নিরাপদ সংযোগ কানেক্টেড</span>
              </div>
              <span>
                IP:{" "}
                <code className="text-slate-800 font-mono font-bold">
                  {ipAddress === "Unknown" ? "যাচাই হচ্ছে..." : ipAddress}
                </code>
              </span>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
