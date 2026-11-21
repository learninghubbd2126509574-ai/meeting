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
  ShieldCheck,
  Bell,
  Clock,
  Calendar,
  AlertTriangle,
  Lock,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { motion } from "motion/react";

function getBrowserFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language || "en",
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
  const [ipAddress, setIpAddress] = useState<string>("যাচাই চলছে...");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [isIpBlocked, setIsIpBlocked] = useState<boolean>(false);
  const [isDeviceBlockedById, setIsDeviceBlockedById] =
    useState<boolean>(false);
  const [isDeviceBlockedByFp, setIsDeviceBlockedByFp] =
    useState<boolean>(false);
  const [isUidBlocked, setIsUidBlocked] = useState<boolean>(false);
  const [isVPN, setIsVPN] = useState<boolean>(false);
  const [blockSystemActive, setBlockSystemActive] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem("ue_cache_settings");
      if (cached) {
        const s = JSON.parse(cached);
        return s.blockSystemActive !== false;
      }
    } catch {}
    return true;
  });

  const isBlocked =
    blockSystemActive &&
    (isIpBlocked ||
      isDeviceBlockedById ||
      isDeviceBlockedByFp ||
      isUidBlocked);
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
    async function getIpWithTimeout(timeoutMs = 5000): Promise<string> {
      const endpoints = [
        "https://api.ipify.org?format=json",
        "https://api64.ipify.org?format=json",
        "https://www.cloudflare.com/cdn-cgi/trace",
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
              if (url.includes("cdn-cgi/trace")) {
                const match = trimmed.match(/^ip=(.+)$/m);
                if (match && match[1]) {
                  resolve(match[1].trim());
                  return;
                }
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

      const promises = endpoints.map((url) => fetchWithTimeout(url, timeoutMs));

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
            }, timeoutMs + 500);
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

        if (detectedIp !== "Unknown" && detectedIp !== "যাচাই চলছে...") {
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
            if (sData.blockSystemActive !== undefined) {
              setBlockSystemActive(sData.blockSystemActive !== false);
            }
          }
          setIsLoading(false);
        });

        await fetchMeetingWithRetry();
      } catch (err: any) {
        console.error("Initialization error in setupListeners:", err);
        setErrorMessage(
          "নিরাপত্তা যাচাই সম্পন্ন করা যায়নি। অনুগ্রহ করে পেজটি রিফ্রেশ (Refresh) করে আবার চেষ্টা করুন।",
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
      ipAddress === "যাচাই চলছে..." ||
      ipAddress === "Unknown"
    ) {
      setIsIpBlocked(false);
      return;
    }

    const safeIp = ipAddress.trim().replace(/\//g, "_");
    let sbBlocked = false;
    let fsBlocked = false;

    const unsubBlockIP = dbService.subscribeBlockedIPs((list) => {
      sbBlocked = list.some((b) => b.ip === ipAddress);
      setIsIpBlocked(sbBlocked || fsBlocked);
    });

    const unsubFsIP = onSnapshot(
      doc(db, "blockedIPs", safeIp),
      (snap) => {
        fsBlocked = snap.exists();
        setIsIpBlocked(sbBlocked || fsBlocked);
      },
      () => {}
    );

    dbService.isIPBlocked(ipAddress).then((blocked) => {
      if (blocked) setIsIpBlocked(true);
    });

    return () => {
      unsubBlockIP();
      unsubFsIP();
    };
  }, [ipAddress]);

  useEffect(() => {
    if (!deviceId || deviceId === "Unknown") {
      setIsDeviceBlockedById(false);
      return;
    }

    const safeDev = deviceId.trim().replace(/\//g, "_");
    let sbBlocked = false;
    let fsBlocked = false;

    const unsubBlockDevice = dbService.subscribeBlockedDevices((list) => {
      sbBlocked = list.some((b) => b.deviceId === deviceId);
      setIsDeviceBlockedById(sbBlocked || fsBlocked);
    });

    const unsubFsDev = onSnapshot(
      doc(db, "blockedDevices", safeDev),
      (snap) => {
        fsBlocked = snap.exists();
        setIsDeviceBlockedById(sbBlocked || fsBlocked);
      },
      () => {}
    );

    return () => {
      unsubBlockDevice();
      unsubFsDev();
    };
  }, [deviceId]);

  useEffect(() => {
    if (!uid || uid === "Unknown") {
      setIsUidBlocked(false);
      return;
    }

    const safeUid = uid.trim().replace(/\//g, "_");
    let sbBlocked = false;
    let fsBlocked = false;

    const unsubBlockUid = dbService.subscribeBlockedUIDs((list) => {
      sbBlocked = list.some((b) => b.uid === uid);
      setIsUidBlocked(sbBlocked || fsBlocked);
    });

    const unsubFsUid = onSnapshot(
      doc(db, "blockedUIDs", safeUid),
      (snap) => {
        fsBlocked = snap.exists();
        setIsUidBlocked(sbBlocked || fsBlocked);
      },
      () => {}
    );

    return () => {
      unsubBlockUid();
      unsubFsUid();
    };
  }, [uid]);

  async function resolveIpQuickly(): Promise<string> {
    if (
      ipAddress &&
      ipAddress !== "যাচাই চলছে..." &&
      ipAddress !== "Unknown"
    ) {
      return ipAddress;
    }

    const tryJsonIp = (url: string) =>
      fetch(url).then(async (r) => {
        if (!r.ok) throw new Error("HTTP error");
        const data = await r.json();
        const ip = (data?.ip || data?.ipAddress || "").trim();
        if (!ip) throw new Error("Empty IP");
        return ip;
      });

    const tryCloudflareIp = () =>
      fetch("https://www.cloudflare.com/cdn-cgi/trace").then(async (r) => {
        if (!r.ok) throw new Error("HTTP error");
        const t = await r.text();
        const m = t.match(/^ip=(.+)$/m);
        const ip = m?.[1]?.trim() || "";
        if (!ip) throw new Error("Empty IP");
        return ip;
      });

    try {
      const lookupPromise =
        typeof Promise.any === "function"
          ? Promise.any([
              tryJsonIp("https://api.ipify.org?format=json"),
              tryCloudflareIp(),
              tryJsonIp("https://api64.ipify.org?format=json"),
              tryJsonIp("https://ipinfo.io/json"),
            ])
          : tryJsonIp("https://api.ipify.org?format=json");

      const resolved = await Promise.race([
        lookupPromise.catch(() => "Unknown"),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("Unknown"), 1800)
        ),
      ]);

      if (resolved && resolved !== "Unknown") {
        setIpAddress(resolved);
        return resolved;
      }
    } catch {}
    return "Unknown";
  }

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
        "দুঃখিত, এই পাবলিক লিংকের মাধ্যমে মিটিংয়ে জয়েনিং বর্তমানে বন্ধ রয়েছে।",
      );
      return;
    }

    if (!googleMeetLink) {
      setErrorMessage(
        "এই সেশনের জন্য এখনো Google Meet লিংক যুক্ত করা হয়নি।",
      );
      return;
    }

    if (!meetingActive) {
      setErrorMessage(
        "এই কাউন্সেলিং সেশনটি বর্তমানে বন্ধ রয়েছে অথবা সমাপ্ত হয়েছে।",
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const finalIp = await resolveIpQuickly();

      if (blockSystemActive && isBlocked) {
        setIsSubmitting(false);
        return;
      }

      if (blockSystemActive && finalIp && finalIp !== "Unknown") {
        try {
          if (await dbService.isIPBlocked(finalIp)) {
            setIsIpBlocked(true);
            setIsSubmitting(false);
            return;
          }
        } catch (e) {}
      }

      if (blockSystemActive && deviceId && deviceId !== "Unknown") {
        try {
          if (await dbService.isDeviceBlocked(deviceId)) {
            setIsDeviceBlockedById(true);
            setIsSubmitting(false);
            return;
          }
        } catch (e) {}
      }

      if (blockSystemActive && uid && uid !== "Unknown") {
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
              "দুঃখিত, এই IP Address থেকে ইতিমধ্যেই অন্য একটি ডিভাইসে মিটিংয়ে জয়েন করা হয়েছে। একই Wi-Fi বা ইন্টারনেট সংযোগ থেকে একাধিক ডিভাইস দিয়ে জয়েন করা যাবে না।",
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
          "এই কাউন্সেলিং সেশনটি বর্তমানে বন্ধ আছে অথবা শেষ হয়ে গেছে।",
        );
        setIsSubmitting(false);
        return;
      }

      if (!currentMeetLink || !currentMeetLink.trim()) {
        setErrorMessage(
          "Google Meet লিংক লোড হচ্ছে। অনুগ্রহ করে আবার 'মিটিংয়ে জয়েন করুন' বাটনে ক্লিক করুন।",
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
        "সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। আপনার ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।",
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
        "ভুল Demo Code দিয়েছেন। অনুগ্রহ করে অ্যাডমিনের দেওয়া ৪ সংখ্যার সঠিক কোডটি লিখুন।",
      );
    }
  }

  async function handleDemoJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!demoNameInput.trim()) {
      setDemoError("আপনার পূর্ণ নাম (Full Name) লেখা আবশ্যক।");
      return;
    }

    if (!googleMeetLink) {
      setDemoError(
        "এই সেশনের জন্য এখনো Google Meet লিংক যুক্ত করা হয়নি।",
      );
      return;
    }

    if (!meetingActive) {
      setDemoError(
        "এই কাউন্সেলিং সেশনটি বর্তমানে বন্ধ আছে অথবা শেষ হয়ে গেছে।",
      );
      return;
    }

    const finalIp =
      !ipAddress || ipAddress === "যাচাই চলছে..." ? "Unknown" : ipAddress;

    try {
      setIsDemoSubmitting(true);
      setDemoError(null);

      const resolvedDemoIp =
        finalIp === "Unknown" ? await resolveIpQuickly() : finalIp;

      if (blockSystemActive && (isIpBlocked || isDeviceBlockedById || isDeviceBlockedByFp || isUidBlocked)) {
        setIsDemoSubmitting(false);
        setDemoError(
          "দুঃখিত, আপনার IP Address বা ডিভাইস ব্লক থাকায় আপনি মিটিংয়ে জয়েন করতে পারবেন না।",
        );
        return;
      }

      if (blockSystemActive && resolvedDemoIp && resolvedDemoIp !== "Unknown") {
        try {
          if (await dbService.isIPBlocked(resolvedDemoIp)) {
            setIsIpBlocked(true);
            setIsDemoSubmitting(false);
            setDemoError("দুঃখিত, আপনার IP Address টি ব্লক করা হয়েছে।");
            return;
          }
        } catch (e) {}
      }

      if (blockSystemActive && deviceId && deviceId !== "Unknown") {
        try {
          if (await dbService.isDeviceBlocked(deviceId)) {
            setIsDeviceBlockedById(true);
            setIsDemoSubmitting(false);
            setDemoError("দুঃখিত, আপনার ডিভাইসটি ব্লক করা হয়েছে।");
            return;
          }
        } catch (e) {}
      }

      if (blockSystemActive && uid && uid !== "Unknown") {
        try {
          if (await dbService.isUIDBlocked(uid)) {
            setIsUidBlocked(true);
            setIsDemoSubmitting(false);
            setDemoError("দুঃখিত, আপনার User ID (UID) টি ব্লক করা হয়েছে।");
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
          ip: resolvedDemoIp,
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
          "এই কাউন্সেলিং সেশনটি বর্তমানে বন্ধ আছে অথবা শেষ হয়ে গেছে।",
        );
        setIsDemoSubmitting(false);
        return;
      }

      if (!googleMeetLink) {
        setDemoError(
          "এই সেশনের জন্য এখনো Google Meet লিংক যুক্ত করা হয়নি।",
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
      setDemoError("সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
      setIsDemoSubmitting(false);
    }
  }

  function getMeetingDateAndParts(dateStr?: string | null, timeStr?: string | null) {
    let formattedDate = "";
    if (dateStr) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const monthsEn = [
          "Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];
        const monthIndex = parseInt(month, 10) - 1;
        const monthLabel = monthsEn[monthIndex] || month;
        formattedDate = `${day} ${monthLabel} ${year}`;
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
        const ampm = hour >= 12 ? "PM" : "AM";
        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;
        formattedTime = `${hour}:${minute} ${ampm}`;
      } else {
        formattedTime = timeStr;
      }
    }

    return {
      formattedDate: formattedDate || "আজকের লাইভ সেশন",
      formattedTime: formattedTime || "নির্ধারিত সময়",
    };
  }

  const schedule = getMeetingDateAndParts(meetingDate, meetingTime);

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-[#111827] flex flex-col justify-start sm:justify-center items-center p-0 sm:p-4 md:p-6 select-text overflow-x-hidden font-sans">
      {/* MAIN RESPONSIVE PORTAL COLUMN */}
      <div className="w-full max-w-[440px] mx-auto flex flex-col min-h-screen sm:min-h-0">

        {/* MEETING NOTIFICATION POPUP (Unity Earning / Counseling Session / E-learning Platform + Formal Bengali Instructions) */}
        {showNotificationPopup && !isLoading && !isBlocked && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4 font-sans animate-fadeIn">
            <div className="w-full max-w-[390px] bg-white rounded-3xl border border-[#dce3ec] shadow-[0_24px_48px_rgba(11,74,139,0.22)] overflow-hidden relative">
              {/* Corporate Brand Header Banner (All English as requested) */}
              <div className="bg-gradient-to-br from-[#0b4a8b] via-[#0d549d] to-[#08386b] text-white px-6 pt-7 pb-6 text-center relative">
                <button
                  type="button"
                  onClick={() => setShowNotificationPopup(false)}
                  className="absolute top-3.5 right-3.5 text-white/80 hover:text-white bg-white/15 hover:bg-white/25 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition cursor-pointer"
                  aria-label="Close"
                >
                  ✕
                </button>

                <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-white shadow-sm">
                  <Bell className="h-5 w-5" />
                </div>

                <p className="text-[12px] font-bold tracking-[0.18em] uppercase text-[#a5d8ff]">
                  Unity Earning
                </p>
                <h2 className="text-[22px] font-extrabold tracking-tight text-white mt-1 leading-tight">
                  Counseling Session
                </h2>
                <div className="mt-1.5 flex items-center justify-center gap-2">
                  <span className="h-px w-6 bg-white/30" />
                  <p className="text-[12.5px] font-semibold tracking-wide text-emerald-200">
                    E-learning Platform
                  </p>
                  <span className="h-px w-6 bg-white/30" />
                </div>
              </div>

              {/* Formal Bengali Instructions Body */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="text-center space-y-1">
                  <h3 className="text-[15.5px] font-extrabold text-[#111827] leading-snug">
                    মিটিংয়ে প্রবেশের গুরুত্বপূর্ণ নির্দেশনা
                  </h3>
                  <p className="text-[12px] text-[#64748b] font-medium">
                    অনুগ্রহ করে নিচের ধাপগুলো অনুসরণ করে সেশনে যোগ দিন
                  </p>
                </div>

                <div className="bg-[#f6faff] border border-[#d6e6f7] rounded-2xl p-4 space-y-3 text-left">
                  <div className="flex items-start gap-3">
                    <span className="h-6 w-6 rounded-lg bg-[#0b4a8b] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      ১
                    </span>
                    <p className="text-[12.5px] font-medium text-[#334155] leading-relaxed">
                      পরবর্তী স্ক্রিনের{" "}
                      <strong className="text-[#0b4a8b] font-bold">
                        Full Name
                      </strong>{" "}
                      বক্সে অবশ্যই আপনার{" "}
                      <strong className="text-[#111827] font-bold">
                        আসল পূর্ণ নাম
                      </strong>{" "}
                      লিখুন।
                    </p>
                  </div>

                  <div className="h-px bg-[#e2ecf7]" />

                  <div className="flex items-start gap-3">
                    <span className="h-6 w-6 rounded-lg bg-[#0d7a5f] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      ২
                    </span>
                    <p className="text-[12.5px] font-medium text-[#334155] leading-relaxed">
                      নাম লেখার পর নিচের{" "}
                      <strong className="text-[#0b4a8b] font-bold">
                        “মিটিংয়ে জয়েন করুন (Join Meeting)”
                      </strong>{" "}
                      বাটনে ক্লিক করে সরাসরি Google Meet-এ প্রবেশ করুন।
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowNotificationPopup(false)}
                  className="w-full py-3.5 bg-gradient-to-r from-[#0b4a8b] to-[#0d7a5f] hover:from-[#083a6e] hover:to-[#09604a] text-white font-extrabold rounded-xl shadow-[0_6px_18px_rgba(11,74,139,0.25)] transition text-[13.5px] cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-200 shrink-0" />
                  <span>বুঝেছি, এগিয়ে যান (Continue)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DEMO MODE MODAL OVERLAY */}
        {demoModeStep !== null && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[90] flex items-center justify-center p-4 font-sans animate-fadeIn">
            <div className="w-full max-w-sm bg-white rounded-2xl border border-[#e6eaf0] shadow-xl p-5 relative space-y-4">
              <button
                type="button"
                onClick={() => {
                  setDemoModeStep(null);
                  setDemoEnteredCode("");
                  setDemoNameInput("");
                  setDemoGmailInput("");
                  setDemoError(null);
                }}
                className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold transition cursor-pointer"
                aria-label="Close"
              >
                ✕
              </button>

              <div className="text-center space-y-1 pt-1">
                <span className="inline-block bg-[#ddf1fa] text-[#0b4a8b] px-2.5 py-0.5 rounded-md text-[10.5px] font-bold">
                  Demo User Portal · ডেমো পোর্টাল
                </span>
                <h3 className="text-base font-bold text-[#111827] pt-0.5">
                  ডেমো অ্যাক্সেস সাইন-ইন
                </h3>
                <p className="text-[11.5px] text-slate-500 font-medium">
                  অ্যাডমিনের দেওয়া ৪ সংখ্যার Access Code দিন।
                </p>
              </div>

              {demoError && (
                <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-xl p-3 flex items-start gap-2 text-slate-700 font-semibold text-xs leading-relaxed">
                  <AlertTriangle className="h-4 w-4 text-[#d97706] shrink-0 mt-0.5" />
                  <span>{demoError}</span>
                </div>
              )}

              {demoModeStep === "enter_code" && (
                <form onSubmit={handleDemoCodeVerify} className="space-y-4">
                  <div className="space-y-1.5 text-center">
                    <label className="text-xs font-bold text-slate-700 block">
                      ৪ সংখ্যার Access Code লিখুন
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
                      className="w-40 mx-auto text-center px-4 py-2.5 bg-[#f8fafc] border border-[#dce3ec] rounded-xl text-[#111827] font-mono tabular-nums font-bold text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-[#0b4a8b]/20 focus:border-[#0b4a8b] focus:bg-white transition"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-[#0b4a8b] hover:bg-[#083a6e] text-white font-bold rounded-xl shadow-sm transition text-xs cursor-pointer"
                  >
                    কোড যাচাই করুন (Verify Code)
                  </button>
                </form>
              )}

              {demoModeStep === "enter_info" && (
                <form onSubmit={handleDemoJoin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      আপনার পূর্ণ নাম (Full Name)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="এখানে আপনার নাম লিখুন..."
                      value={demoNameInput}
                      onChange={(e) => setDemoNameInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#f8fafc] border border-[#dce3ec] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#0b4a8b]/20 focus:border-[#0b4a8b] focus:bg-white transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isDemoSubmitting}
                    className="w-full py-3 bg-[#0d7a5f] hover:bg-[#0a634d] text-white font-bold rounded-xl shadow-sm transition text-xs cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isDemoSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                        <span>মিটিংয়ে যুক্ত হচ্ছে...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 text-white" />
                        <span>মিটিংয়ে জয়েন করুন (Demo)</span>
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
          <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[460px]">
            <div className="w-full bg-white border border-[#e6eaf0] rounded-2xl p-8 shadow-[0_2px_8px_rgba(15,23,42,0.04)] text-center space-y-4">
              <div className="h-12 w-12 bg-[#edf4fc] border border-[#d6e6f7] rounded-xl flex items-center justify-center mx-auto">
                <Loader2 className="h-6 w-6 animate-spin text-[#0b4a8b]" />
              </div>
              <div className="space-y-1">
                <p className="text-[#111827] font-bold text-sm">
                  ডিভাইস যাচাই করা হচ্ছে (Verifying...)
                </p>
                <p className="text-slate-500 font-medium text-xs">
                  নিরাপত্তা অবস্থা এবং নেটওয়ার্ক সংযোগ পরীক্ষা চলছে...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* BLOCKED SCREEN */}
        {!isLoading && isBlocked && (
          <div className="flex-1 flex flex-col justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-white border border-[#e6eaf0] rounded-2xl p-6 shadow-[0_2px_8px_rgba(15,23,42,0.04)] space-y-5 text-center"
            >
              <div className="h-14 w-14 bg-rose-50 rounded-xl border border-rose-200 flex items-center justify-center mx-auto">
                <ShieldAlert className="h-7 w-7 text-rose-600" />
              </div>

              <div className="space-y-2">
                <span className="inline-block bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-md text-[11px] font-bold">
                  নিরাপত্তা ফিল্টার চালু · Security Filter
                </span>
                <h1 className="text-lg font-bold text-[#111827]">
                  প্রবেশাধিকার ব্লক করা হয়েছে! (Blocked)
                </h1>

                {isVPN ? (
                  <p className="text-slate-600 text-xs leading-relaxed font-medium">
                    নিরাপত্তার স্বার্থে{" "}
                    <span className="font-bold text-rose-600">
                      VPN বা Proxy নেটওয়ার্ক
                    </span>{" "}
                    ব্যবহার করে মিটিংয়ে জয়েন করা সম্পূর্ণ নিষিদ্ধ। অনুগ্রহ করে সাধারণ Wi-Fi বা মোবাইল ডাটা ব্যবহার করুন।
                  </p>
                ) : (
                  <p className="text-slate-600 text-xs leading-relaxed font-medium">
                    দুঃখিত, আমাদের সিকিউরিটি ফিল্টার আপনার{" "}
                    <span className="font-bold text-rose-600">
                      IP Address বা Device ID
                    </span>{" "}
                    ব্লক করেছে। আপনি এই মিটিং সেশনে প্রবেশ করতে পারবেন না।
                  </p>
                )}
              </div>

              <div className="bg-[#f8fafc] border border-[#e6eaf0] px-4 py-3 rounded-xl font-mono tabular-nums text-[11px] font-semibold text-slate-700 text-left space-y-2">
                <div className="flex justify-between border-b border-slate-200/70 pb-1.5">
                  <span className="text-slate-500">IP ADDRESS</span>
                  <span className="text-rose-600 font-bold">{ipAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">USER ID (UID)</span>
                  <span className="text-[#0b4a8b] font-bold">{uid || "Unknown"}</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* MARQUEE ANNOUNCEMENT */}
        {!isLoading && !isBlocked && noticeActive && noticeText.trim() && (
          <div className="w-full sm:rounded-t-2xl bg-[#0b4a8b] text-white py-2 px-3.5 overflow-hidden flex items-center gap-2.5 select-none shrink-0 z-40">
            <span className="inline-flex items-center gap-1 bg-white text-[#0b4a8b] px-2 py-0.5 rounded text-[10.5px] font-extrabold shrink-0">
              <Bell className="h-3 w-3 shrink-0" />
              <span>নোটিশ</span>
            </span>

            <div className="flex-1 overflow-hidden relative h-4 flex items-center">
              <div className="animate-marquee whitespace-nowrap text-[11.5px] font-medium text-blue-50">
                {noticeText} &nbsp;&nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp;&nbsp; {noticeText}
              </div>
            </div>
          </div>
        )}

        {/* MAIN CORPORATE PORTAL VIEW */}
        {!isLoading && !isBlocked && (
          <div className="flex-1 p-3.5 sm:p-4 flex flex-col space-y-3.5 animate-fadeIn">

            {/* 1. CENTERED CORPORATE HEADER CARD (Demo trigger when Demo Mode active) */}
            <div
              onClick={() => {
                if (demoModeActive) {
                  setDemoModeStep("enter_code");
                  setDemoEnteredCode("");
                  setDemoNameInput("");
                  setDemoGmailInput("");
                  setDemoError(null);
                }
              }}
              className={`relative overflow-hidden bg-gradient-to-br from-[#0b4a8b] via-[#0c529a] to-[#083a6e] text-white rounded-2xl px-5 py-4 shadow-[0_8px_22px_rgba(11,74,139,0.22)] text-center select-none ${
                demoModeActive ? "cursor-pointer hover:brightness-105 transition" : ""
              }`}
              title={demoModeActive ? "Demo Session Login" : undefined}
            >
              <div className="relative z-10 flex flex-col items-center justify-center space-y-1">
                <p className="text-[12px] sm:text-[13px] font-bold text-[#bfe0ff] leading-tight">
                  <span>Unity Earning</span>{" "}
                  <span className="text-emerald-200 font-semibold">E-learning Platform</span>
                </p>

                <h1 className="text-[21px] sm:text-[23px] font-extrabold tracking-tight leading-snug text-white [text-wrap:balance]">
                  সেমিনার মিটিং পোর্টাল
                </h1>

                <p className="text-[11px] font-semibold text-white/80 tracking-wide">
                  Live · সেশন চালু আছে
                </p>
              </div>
            </div>

            {/* 2. SLIM, COMPACT 2-COLUMN DATE & TIME BAR */}
            <div className="grid grid-cols-2 gap-3 select-none">
              <div className="bg-white border border-[#e6eaf0] rounded-2xl px-3.5 py-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#111827] leading-tight">
                    মিটিংয়ের তারিখ (Date)
                  </p>
                  <p className="text-[11.5px] font-bold text-[#0d7a5f] truncate mt-0.5 tabular-nums">
                    {schedule.formattedDate}
                  </p>
                </div>
                <Calendar className="h-4 w-4 text-[#0b4a8b]/60 shrink-0" />
              </div>

              <div className="bg-white border border-[#e6eaf0] rounded-2xl px-3.5 py-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#111827] leading-tight">
                    নির্ধারিত সময় (Time)
                  </p>
                  <p className="text-[11.5px] font-bold text-[#0d7a5f] truncate mt-0.5 tabular-nums">
                    {schedule.formattedTime}
                  </p>
                </div>
                <Clock className="h-4 w-4 text-[#0b4a8b]/60 shrink-0" />
              </div>
            </div>

            {/* 3. ICE-BLUE STATUS & VERIFIED CONNECTION BANNER */}
            <div className="bg-[#edf4fc] border border-[#d6e6f7] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2.5 select-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-white border border-[#d6e6f7] flex items-center justify-center text-[#0b4a8b] shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <p className="text-[11.5px] font-semibold text-slate-700 truncate">
                  Verified IP · যাচাইকৃত আইপি:{" "}
                  <span className="font-mono tabular-nums font-bold text-[#0b4a8b]">
                    {ipAddress === "Unknown" ? "যাচাইকৃত (Protected)" : ipAddress}
                  </span>
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-[#0b4a8b] shrink-0" />
            </div>

            {/* ALERTS (if errors / inactive states) */}
            {errorMessage &&
              !errorMessage.includes("Quota") &&
              !errorMessage.includes("quota") && (
                <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-2xl p-3.5 flex items-start gap-2.5 text-left">
                  <AlertTriangle className="h-4 w-4 text-[#d97706] shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                    {errorMessage}
                  </p>
                </div>
              )}

            {!meetingActive && (
              <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-2xl p-3.5 flex items-start gap-2.5 text-left">
                <AlertCircle className="h-4 w-4 text-[#d97706] shrink-0 mt-0.5" />
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
                  এই সেমিনার সেশনটি বর্তমানে বন্ধ রয়েছে। অ্যাডমিন লিংক সক্রিয় করলে আপনি মিটিংয়ে প্রবেশ করতে পারবেন।
                </p>
              </div>
            )}

            {!publicLinkActive && (
              <div className="bg-white border border-[#e6eaf0] rounded-2xl p-5 text-center space-y-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
                <div className="mx-auto w-10 h-10 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-center">
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                </div>
                <h3 className="font-bold text-sm text-[#111827]">
                  মিটিংয়ে প্রবেশ সাময়িকভাবে বন্ধ
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  অ্যাডমিন সাময়িকভাবে পাবলিক লিংকের মাধ্যমে প্রবেশ বন্ধ রেখেছেন।
                </p>
              </div>
            )}

            {/* 4. EYE-CATCHING LEFT-TO-RIGHT HIGHLIGHTED NAME INPUT CARD & JOIN BUTTON */}
            <form
              key={showNotificationPopup ? "join-waiting" : "join-active"}
              onSubmit={handleJoin}
              className="space-y-3.5 animate-ltr-reveal"
            >
              {publicLinkActive && (
                <div className="relative bg-white border-2 border-[#0b4a8b]/45 rounded-2xl shadow-[0_12px_30px_rgba(11,74,139,0.13)] overflow-hidden text-left">
                  {/* Top accent rail with continuous left-to-right light sweep */}
                  <div className="relative h-1.5 bg-gradient-to-r from-[#0b4a8b] via-[#1262b5] to-[#0d7a5f] overflow-hidden">
                    <div className="animate-ltr-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none" />
                  </div>

                  <div className="p-4 sm:p-5 space-y-3.5">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-xl bg-[#0b4a8b] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                          <User className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-[#111827] font-extrabold text-[15px] leading-tight flex items-center gap-1.5 flex-wrap">
                            <span>আপনার পূর্ণ নাম লিখুন (Full Name)</span>
                            {!fullName.trim() && (
                              <ArrowRight className="h-3.5 w-3.5 text-[#0b4a8b] animate-ltr-nudge shrink-0" />
                            )}
                          </h2>
                          <p className="text-[11.5px] text-[#475569] font-medium mt-0.5">
                            উপস্থিতি নিশ্চিত করতে নিচের বক্সে আপনার সঠিক নাম লিখুন
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-extrabold text-[#0b4a8b] shrink-0 pt-0.5">
                        আবশ্যক
                      </span>
                    </div>

                    {/* PROMINENT HIGHLIGHTED INPUT FIELD WITH LEFT-TO-RIGHT SWEEP */}
                    <div
                      className={`relative overflow-hidden rounded-xl border-2 transition-all duration-200 ${
                        fullName.trim()
                          ? "border-[#0d7a5f] bg-[#f4fbf8] ring-4 ring-[#0d7a5f]/15"
                          : "border-[#0b4a8b] bg-[#f2f7ff] shadow-[0_0_0_4px_rgba(11,74,139,0.10)] focus-within:bg-white focus-within:shadow-[0_0_0_5px_rgba(11,74,139,0.18)]"
                      }`}
                    >
                      {!fullName.trim() && (
                        <div
                          aria-hidden="true"
                          className="animate-ltr-sweep pointer-events-none absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-[#0b4a8b]/12 to-transparent"
                        />
                      )}

                      <div className="relative z-10 flex items-center">
                        <div className="pl-3 flex items-center pointer-events-none shrink-0">
                          <div
                            className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                              fullName.trim()
                                ? "bg-[#0d7a5f] text-white"
                                : "bg-[#0b4a8b] text-white"
                            }`}
                          >
                            <User className="h-4 w-4" />
                          </div>
                        </div>

                        <input
                          type="text"
                          required
                          autoFocus
                          placeholder="এখানে আপনার পূর্ণ নাম লিখুন..."
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full min-h-[52px] pl-3 pr-10 py-3.5 bg-transparent text-[#111827] placeholder:text-[#475569] placeholder:font-semibold text-sm font-extrabold focus:outline-none"
                        />

                        <span className="pr-3 flex items-center pointer-events-none shrink-0">
                          {fullName.trim() ? (
                            <CheckCircle className="h-5 w-5 text-[#0d7a5f]" />
                          ) : (
                            <ArrowRight className="h-4 w-4 text-[#0b4a8b] animate-ltr-nudge" />
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* HIGHLIGHTED JOIN CTA BUTTON WITH LEFT-TO-RIGHT SHIMMER */}
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !fullName.trim() ||
                  ipAddress === "যাচাই চলছে..." ||
                  !publicLinkActive
                }
                className={`relative overflow-hidden w-full min-h-[48px] py-3.5 px-4 font-extrabold rounded-xl transition-all duration-200 text-center flex items-center justify-center gap-2 text-[14px] select-none ${
                  !publicLinkActive
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                    : fullName.trim()
                    ? "bg-gradient-to-r from-[#0b4a8b] to-[#0d7a5f] hover:from-[#083a6e] hover:to-[#09604a] text-white shadow-[0_8px_22px_rgba(11,74,139,0.28)] cursor-pointer active:scale-[0.99]"
                    : "bg-[#e8eff7] border border-[#cbd9ea] text-[#334155] cursor-not-allowed"
                }`}
              >
                {publicLinkActive && fullName.trim() && !isSubmitting && (
                  <span
                    aria-hidden="true"
                    className="animate-ltr-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {ipAddress === "যাচাই চলছে..." ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[#0b4a8b]" />
                      <span>নিরাপত্তা যাচাই চলছে...</span>
                    </>
                  ) : isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>মিটিংয়ে যুক্ত হচ্ছে, অপেক্ষা করুন...</span>
                    </>
                  ) : !publicLinkActive ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-slate-500" />
                      <span>অ্যাডমিন কর্তৃক জয়েনিং বন্ধ</span>
                    </>
                  ) : fullName.trim() ? (
                    <>
                      <CheckCircle className="h-4.5 w-4.5 text-emerald-200" />
                      <span>মিটিংয়ে জয়েন করুন (Join Meeting)</span>
                      <ArrowRight className="h-4 w-4 text-white animate-ltr-nudge" />
                    </>
                  ) : (
                    <>
                      <User className="h-4 w-4 text-[#0b4a8b]" />
                      <span>প্রথমে উপরে আপনার পূর্ণ নাম লিখুন</span>
                      <ArrowRight className="h-4 w-4 text-[#0b4a8b] animate-ltr-nudge" />
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* 5. WARM AMBER CAUTION CARD */}
            <div className="bg-[#fff8e6] border border-[#fde6b0] rounded-2xl p-4 flex items-start gap-3 text-left">
              <AlertTriangle className="h-5 w-5 text-[#d97706] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-[13.5px] font-extrabold text-[#111827]">
                  সঠিক নাম ব্যবহারের সতর্কতা (Important)
                </h3>
                <p className="text-[12px] text-[#334155] leading-relaxed font-medium">
                  অনুগ্রহ করে আপনার{" "}
                  <strong className="text-[#111827] font-bold">
                    আসল পূর্ণ নাম
                  </strong>{" "}
                  লিখুন। ভুল, অসম্পূর্ণ কিংবা ছদ্মনাম ব্যবহার করলে আপনাকে তাৎক্ষণিকভাবে মিটিং থেকে রিমুভ (Remove) করা হতে পারে।
                </p>
              </div>
            </div>

            {/* 6. THIN DIVIDER + SCROLLABLE COUNSELING RULES SECTION */}
            <div className="pt-2 border-t border-[#e6eaf0] space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#111827]">
                  <Lock className="h-3.5 w-3.5 text-[#0b4a8b]" />
                  <span>কাউন্সেলিং সেশনের নিয়মাবলী (Session Rules)</span>
                </div>
                <span className="text-[11px] font-bold text-[#0b4a8b]">
                  ৫টি নির্দেশনা
                </span>
              </div>

              <div className="bg-white border border-[#e6eaf0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] text-left">
                <ul className="space-y-3 text-[12px] text-[#334155] list-none pl-0 leading-relaxed font-medium">
                  <li className="flex items-start gap-2.5 pb-2.5 border-b border-[#f1f5f9]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0b4a8b] text-white text-[10.5px] font-extrabold mt-0.5">
                      ১
                    </span>
                    <span>
                      মিটিংয়ে প্রবেশ করার সাথে সাথে একটি{" "}
                      <strong className="text-[#111827] font-bold">
                        Screenshot (স্ক্রিনশট)
                      </strong>{" "}
                      নিয়ে আপনার কাউন্সিলরের ইনবক্সে প্রেরণ করুন।
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 pb-2.5 border-b border-[#f1f5f9]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0b4a8b] text-white text-[10.5px] font-extrabold mt-0.5">
                      ২
                    </span>
                    <span>
                      সেশনের সকল নিয়ম-শৃঙ্খলা যথাযথভাবে মেনে চলুন এবং মিটিং শেষ না হওয়া পর্যন্ত মনোযোগের সাথে উপস্থিত থাকুন।
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 pb-2.5 border-b border-[#f1f5f9]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0b4a8b] text-white text-[10.5px] font-extrabold mt-0.5">
                      ৩
                    </span>
                    <span>
                      মিটিংয়ের মাঝপথে বের হয়ে গেলে পরবর্তীতে পুনরায় প্রবেশের (Re-join) অনুরোধ গ্রহণ করা হবে না।
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 pb-2.5 border-b border-[#f1f5f9]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0b4a8b] text-white text-[10.5px] font-extrabold mt-0.5">
                      ৪
                    </span>
                    <span>
                      মিটিং চলাকালীন সময়ে মোবাইল ফোনে কল রিসিভ করা বা কথা বলা সম্পূর্ণ নিষিদ্ধ।
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0d7a5f] text-white text-[10.5px] font-extrabold mt-0.5">
                      ৫
                    </span>
                    <span>
                      মিটিংয়ে প্রবেশের সুযোগ প্রথম{" "}
                      <strong className="text-[#111827] font-bold">
                        ১০ মিনিট
                      </strong>{" "}
                      খোলা থাকবে এবং সম্পূর্ণ সেশনটি{" "}
                      <strong className="text-[#111827] font-bold">
                        ৪০ মিনিট
                      </strong>{" "}
                      পরিচালিত হবে।
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* FOOTER */}
            <p className="text-center text-[11px] text-slate-400 pt-1 pb-4 font-medium">
              © {new Date().getFullYear()} Unity Earning · E-learning Platform
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
