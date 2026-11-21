import { supabase } from "./supabase";
import { db, auth } from "./firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";

export interface MeetingDoc {
  id: string;
  googleMeetLink: string;
  active: boolean;
  meetingDate?: string | null;
  meetingTime?: string | null;
  createdAt?: any;
}

export interface ParticipantDoc {
  id: string;
  name: string;
  meetingId?: string;
  ip?: string;
  deviceId?: string;
  uid?: string;
  browserFingerprint?: string;
  userAgent?: string;
  joinedAt?: any;
  blocked?: boolean;
}

export interface DemoParticipantDoc {
  id: string;
  name: string;
  meetingId?: string;
  gmail?: string;
  ip?: string;
  deviceId?: string;
  uid?: string;
  browserFingerprint?: string;
  userAgent?: string;
  joinedAt?: any;
  blocked?: boolean;
}

export interface BlockedIPDoc {
  ip: string;
  name?: string;
  deviceId?: string;
  uid?: string;
  browserFingerprint?: string;
  reason?: string;
  blockedAt?: any;
}

export interface AdminSettingsDoc {
  id?: string;
  password?: string;
  preventRepeatJoins?: boolean;
  publicLinkActive?: boolean;
  noticeText?: string;
  noticeActive?: boolean;
  demoModeActive?: boolean;
  demoCode?: string;
  blockSystemActive?: boolean;
}

function dedupeByKey<T>(
  items: T[],
  getKey: (item: T) => string | undefined | null
): T[] {
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
}

function isValidIdentifier(val?: string | null): val is string {
  if (!val) return false;
  const trimmed = val.trim();
  return (
    trimmed.length > 0 &&
    trimmed !== "Unknown" &&
    trimmed !== "N/A" &&
    trimmed !== "Verifying..." &&
    trimmed !== "যাচাই চলছে..."
  );
}

function safeDocId(val: string): string {
  return val.trim().replace(/\//g, "_");
}

function toTimestampMs(val: any): number {
  if (!val) return 0;
  try {
    if (typeof val?.toDate === "function") return val.toDate().getTime();
    if (typeof val?.seconds === "number") return val.seconds * 1000;
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
}

function normalizeIsoTimestamp(val: any): string {
  if (!val) return new Date().toISOString();
  try {
    if (typeof val?.toDate === "function") return val.toDate().toISOString();
    if (typeof val?.seconds === "number")
      return new Date(val.seconds * 1000).toISOString();
    if (typeof val === "string") return val;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// -------------------------------------------------------------
// MEETINGS
// -------------------------------------------------------------
export async function getMeetings(): Promise<MeetingDoc[]> {
  let supabaseRows: MeetingDoc[] | null = null;
  let firestoreRows: MeetingDoc[] | null = null;

  try {
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .order("createdAt", { ascending: false });

    if (!error && data) {
      supabaseRows = data as MeetingDoc[];
    }
  } catch (err) {
    console.warn("Supabase getMeetings notice:", err);
  }

  try {
    const snap = await getDocs(collection(db, "meetings"));
    firestoreRows = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        googleMeetLink: data.googleMeetLink || "",
        active: data.active !== false,
        meetingDate: data.meetingDate || null,
        meetingTime: data.meetingTime || null,
        createdAt: normalizeIsoTimestamp(data.createdAt),
      };
    });
  } catch (fsErr) {
    // Public fallback safe
  }

  if (supabaseRows !== null || firestoreRows !== null) {
    const merged = dedupeByKey(
      [...(supabaseRows || []), ...(firestoreRows || [])],
      (m) => m.id
    );
    merged.sort(
      (a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt)
    );
    try {
      localStorage.setItem("ue_cache_meetings", JSON.stringify(merged));
    } catch (e) {}
    return merged;
  }

  try {
    const cached = localStorage.getItem("ue_cache_meetings");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return dedupeByKey(parsed as MeetingDoc[], (m) => m.id);
      }
    }
  } catch (e) {}
  return [];
}

export async function getMeetingById(id: string): Promise<MeetingDoc | null> {
  try {
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!error && data) {
      return data as MeetingDoc;
    }
  } catch (err) {
    console.warn("Supabase getMeetingById notice:", err);
  }

  try {
    const snap = await getDoc(doc(db, "meetings", safeDocId(id)));
    if (snap.exists()) {
      const data = snap.data() as any;
      return {
        id: snap.id,
        googleMeetLink: data.googleMeetLink || "",
        active: data.active !== false,
        meetingDate: data.meetingDate || null,
        meetingTime: data.meetingTime || null,
        createdAt: normalizeIsoTimestamp(data.createdAt),
      };
    }
  } catch (e) {}

  try {
    const cached = localStorage.getItem("ue_cache_meetings");
    if (cached) {
      const list: MeetingDoc[] = JSON.parse(cached);
      const found = list.find((m) => m.id === id);
      if (found) return found;
    }
  } catch (e) {}
  return null;
}

export async function saveMeeting(meeting: MeetingDoc): Promise<boolean> {
  try {
    const payload = {
      id: meeting.id,
      googleMeetLink: meeting.googleMeetLink,
      active: meeting.active !== false,
      meetingDate: meeting.meetingDate || null,
      meetingTime: meeting.meetingTime || null,
      createdAt: meeting.createdAt || new Date().toISOString(),
    };

    const supabasePromise = supabase
      .from("meetings")
      .upsert(payload)
      .then(({ error }) => {
        if (error) console.warn("Supabase saveMeeting notice:", error.message || error);
      });

    const firestorePromise = setDoc(
      doc(db, "meetings", safeDocId(meeting.id)),
      payload,
      { merge: true }
    ).catch(() => {});

    await Promise.race([
      Promise.allSettled([supabasePromise, firestorePromise]),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    try {
      const existingStr = localStorage.getItem("ue_cache_meetings");
      let existingList: MeetingDoc[] = existingStr ? JSON.parse(existingStr) : [];
      existingList = dedupeByKey(
        [payload, ...existingList.filter((m) => m.id !== meeting.id)],
        (m) => m.id
      );
      localStorage.setItem("ue_cache_meetings", JSON.stringify(existingList));
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn("Supabase saveMeeting notice:", err);
    return false;
  }
}

export async function updateMeetingStatus(
  id: string,
  active: boolean
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("meetings")
      .update({ active })
      .eq("id", id);

    if (error) console.warn("Supabase updateMeetingStatus notice:", error.message || error);
    updateDoc(doc(db, "meetings", safeDocId(id)), { active }).catch(() => {});

    try {
      const existingStr = localStorage.getItem("ue_cache_meetings");
      if (existingStr) {
        let existingList: MeetingDoc[] = JSON.parse(existingStr);
        existingList = existingList.map((m) =>
          m.id === id ? { ...m, active } : m
        );
        localStorage.setItem("ue_cache_meetings", JSON.stringify(existingList));
      }
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn("Supabase updateMeetingStatus notice:", err);
    return false;
  }
}

export async function deleteMeeting(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) console.warn("Supabase deleteMeeting notice:", error.message || error);
    deleteDoc(doc(db, "meetings", safeDocId(id))).catch(() => {});

    try {
      const existingStr = localStorage.getItem("ue_cache_meetings");
      if (existingStr) {
        let existingList: MeetingDoc[] = JSON.parse(existingStr);
        existingList = existingList.filter((m) => m.id !== id);
        localStorage.setItem("ue_cache_meetings", JSON.stringify(existingList));
      }
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn("Supabase deleteMeeting notice:", err);
    return false;
  }
}

export async function deleteAllMeetings(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("meetings")
      .delete()
      .neq("id", "___impossible_val___");
    if (error) console.warn("Supabase deleteAllMeetings notice:", error.message || error);
  } catch (err) {
    console.warn("Supabase deleteAllMeetings notice:", err);
  }

  try {
    localStorage.removeItem("ue_cache_meetings");
  } catch (e) {}
  return true;
}

export function subscribeMeetings(onUpdate: (meetings: MeetingDoc[]) => void) {
  let latestSupabase: MeetingDoc[] | null = null;
  let latestFirestore: MeetingDoc[] | null = null;

  const emitMerged = () => {
    if (latestSupabase === null && latestFirestore === null) return;
    const merged = dedupeByKey(
      [...(latestSupabase || []), ...(latestFirestore || [])],
      (m) => m.id
    );
    merged.sort(
      (a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt)
    );
    try {
      localStorage.setItem("ue_cache_meetings", JSON.stringify(merged));
    } catch (e) {}
    onUpdate(merged);
  };

  const fetchSupabaseOnly = async () => {
    try {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("createdAt", { ascending: false });
      if (!error && data) {
        latestSupabase = data as MeetingDoc[];
        emitMerged();
      }
    } catch (err) {
      console.warn("Supabase subscribeMeetings notice:", err);
    }
  };

  fetchSupabaseOnly();

  const channel = supabase
    .channel("realtime_meetings")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "meetings" },
      () => {
        fetchSupabaseOnly();
      }
    )
    .subscribe();

  const unsubFirestore = onSnapshot(
    collection(db, "meetings"),
    (snap) => {
      latestFirestore = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          googleMeetLink: data.googleMeetLink || "",
          active: data.active !== false,
          meetingDate: data.meetingDate || null,
          meetingTime: data.meetingTime || null,
          createdAt: normalizeIsoTimestamp(data.createdAt),
        };
      });
      emitMerged();
    },
    () => {}
  );

  return () => {
    supabase.removeChannel(channel);
    unsubFirestore();
  };
}

// Helper to fetch all rows from a Supabase table beyond the default 1000 row limit
async function fetchAllRows<T>(table: string, orderCol: string): Promise<T[] | null> {
  try {
    const pageSize = 1000;
    let all: T[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order(orderCol, { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.warn(`Supabase ${table} fetch notice:`, error.message || error);
        return all.length > 0 ? dedupeByKey(all, (r: any) => r?.id) : null;
      }
      if (!data || data.length === 0) break;
      all = all.concat(data as T[]);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return dedupeByKey(all, (r: any) => r?.id);
  } catch (err) {
    console.warn(`Supabase fetchAllRows(${table}) notice:`, err);
    return null;
  }
}

// -------------------------------------------------------------
// PARTICIPANTS (Permanent until Admin deletes)
// -------------------------------------------------------------
export async function getParticipants(): Promise<ParticipantDoc[]> {
  const supabaseRows = await fetchAllRows<ParticipantDoc>("participants", "joinedAt");
  let firestoreRows: ParticipantDoc[] | null = null;

  if (auth.currentUser) {
    try {
      const snap = await getDocs(collection(db, "participants"));
      firestoreRows = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name || "",
          meetingId: data.meetingId || undefined,
          ip: data.ip || "Unknown",
          deviceId: data.deviceId || "Unknown",
          uid: data.uid || "Unknown",
          browserFingerprint: data.browserFingerprint || "",
          userAgent: data.userAgent || "",
          joinedAt: normalizeIsoTimestamp(data.joinedAt),
          blocked: data.blocked === true,
        };
      });
    } catch (fsErr) {
      console.warn("Firestore getParticipants fallback notice:", fsErr);
    }
  }

  if (supabaseRows !== null || firestoreRows !== null) {
    const merged = dedupeByKey(
      [...(supabaseRows || []), ...(firestoreRows || [])],
      (p) => p.id
    );
    merged.sort(
      (a, b) => toTimestampMs(b.joinedAt) - toTimestampMs(a.joinedAt)
    );
    try {
      localStorage.setItem("ue_cache_participants", JSON.stringify(merged));
    } catch (e) {}
    return merged;
  }

  try {
    const cached = localStorage.getItem("ue_cache_participants");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return dedupeByKey(parsed as ParticipantDoc[], (p) => p.id);
      }
    }
  } catch (e) {}
  return [];
}

export async function saveParticipant(p: ParticipantDoc): Promise<boolean> {
  const payload = {
    id: p.id,
    meetingId: p.meetingId || null,
    name: p.name,
    ip: p.ip || "Unknown",
    deviceId: p.deviceId || "Unknown",
    uid: p.uid || "Unknown",
    browserFingerprint: p.browserFingerprint || null,
    userAgent: p.userAgent || null,
    joinedAt: p.joinedAt || new Date().toISOString(),
    blocked: p.blocked === true,
  };

  // Persist immediately in localStorage cache
  try {
    const existingStr = localStorage.getItem("ue_cache_participants");
    let list: ParticipantDoc[] = existingStr ? JSON.parse(existingStr) : [];
    list = dedupeByKey(
      [payload, ...list.filter((x) => x.id !== p.id)],
      (x) => x.id
    );
    localStorage.setItem("ue_cache_participants", JSON.stringify(list));
  } catch (e) {}

  // Dual-write in parallel to Supabase & Firestore and await at least one confirmed write before redirecting
  const supabasePromise = (async () => {
    try {
      const { error } = await supabase.from("participants").upsert(payload);
      if (error) {
        console.warn("Supabase saveParticipant error:", error.message || error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn("Supabase saveParticipant exception:", err);
      return false;
    }
  })();

  const firestorePromise = (async () => {
    try {
      await setDoc(doc(db, "participants", safeDocId(payload.id)), payload, {
        merge: true,
      });
      return true;
    } catch (err) {
      return false;
    }
  })();

  // Wait up to 4.5s for both, or finish immediately once at least one succeeds after a short grace window
  const allResult = await Promise.race([
    Promise.all([supabasePromise, firestorePromise]).then(([s, f]) => s || f),
    new Promise<boolean>((resolve) => {
      let resolved = false;
      supabasePromise.then((ok) => {
        if (ok && !resolved) {
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(true);
            }
          }, 450);
        }
      });
      firestorePromise.then((ok) => {
        if (ok && !resolved) {
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(true);
            }
          }, 450);
        }
      });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, 4500);
    }),
  ]);

  return allResult;
}

export async function markParticipantsBlocked(
  ids: string[],
  blocked: boolean
): Promise<void> {
  if (!ids.length) return;
  try {
    await supabase.from("participants").update({ blocked }).in("id", ids);
  } catch (e) {}

  await Promise.allSettled(
    ids.map((id) =>
      updateDoc(doc(db, "participants", safeDocId(id)), { blocked }).catch(
        () => {}
      )
    )
  );

  try {
    const existingStr = localStorage.getItem("ue_cache_participants");
    if (existingStr) {
      const list: ParticipantDoc[] = JSON.parse(existingStr);
      const updated = list.map((p) =>
        ids.includes(p.id) ? { ...p, blocked } : p
      );
      localStorage.setItem("ue_cache_participants", JSON.stringify(updated));
    }
  } catch (e) {}
}

export async function deleteParticipant(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("participants").delete().eq("id", id);
    if (error) console.error("Supabase deleteParticipant error:", error);
    await deleteDoc(doc(db, "participants", safeDocId(id))).catch(() => {});

    try {
      const existingStr = localStorage.getItem("ue_cache_participants");
      if (existingStr) {
        let list: ParticipantDoc[] = JSON.parse(existingStr);
        list = list.filter((p) => p.id !== id);
        localStorage.setItem("ue_cache_participants", JSON.stringify(list));
      }
    } catch (e) {}
    return true;
  } catch (err) {
    console.warn("Supabase deleteParticipant notice:", err);
    return false;
  }
}

export async function deleteAllParticipants(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("participants")
      .delete()
      .neq("id", "___impossible_val___");
    if (error) console.error("Supabase deleteAllParticipants error:", error);
  } catch (err) {
    console.warn("Supabase deleteAllParticipants notice:", err);
  }

  try {
    localStorage.removeItem("ue_cache_participants");
  } catch (e) {}
  return true;
}

export function subscribeParticipants(
  onUpdate: (participants: ParticipantDoc[]) => void
) {
  let latestSupabase: ParticipantDoc[] | null = null;
  let latestFirestore: ParticipantDoc[] | null = null;

  const emitMerged = () => {
    if (latestSupabase === null && latestFirestore === null) return;
    const merged = dedupeByKey(
      [...(latestSupabase || []), ...(latestFirestore || [])],
      (p) => p.id
    );
    merged.sort(
      (a, b) => toTimestampMs(b.joinedAt) - toTimestampMs(a.joinedAt)
    );
    try {
      localStorage.setItem("ue_cache_participants", JSON.stringify(merged));
    } catch (e) {}
    onUpdate(merged);
  };

  const fetchSupabaseOnly = async () => {
    const rows = await fetchAllRows<ParticipantDoc>("participants", "joinedAt");
    if (rows !== null) {
      latestSupabase = rows;
      emitMerged();
    }
  };

  fetchSupabaseOnly();

  const channel = supabase
    .channel("realtime_participants")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "participants" },
      () => {
        fetchSupabaseOnly();
      }
    )
    .subscribe();

  let unsubFirestore: (() => void) | null = null;
  if (auth.currentUser) {
    unsubFirestore = onSnapshot(
      collection(db, "participants"),
      (snap) => {
        latestFirestore = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || "",
            meetingId: data.meetingId || undefined,
            ip: data.ip || "Unknown",
            deviceId: data.deviceId || "Unknown",
            uid: data.uid || "Unknown",
            browserFingerprint: data.browserFingerprint || "",
            userAgent: data.userAgent || "",
            joinedAt: normalizeIsoTimestamp(data.joinedAt),
            blocked: data.blocked === true,
          };
        });
        emitMerged();
      },
      () => {}
    );
  }

  return () => {
    supabase.removeChannel(channel);
    if (unsubFirestore) unsubFirestore();
  };
}

// -------------------------------------------------------------
// DEMO PARTICIPANTS (Permanent until Admin deletes)
// -------------------------------------------------------------
export async function getDemoParticipants(): Promise<DemoParticipantDoc[]> {
  const supabaseRows = await fetchAllRows<DemoParticipantDoc>(
    "demo_participants",
    "joinedAt"
  );
  let firestoreRows: DemoParticipantDoc[] | null = null;

  if (auth.currentUser) {
    try {
      const snap = await getDocs(collection(db, "demoParticipants"));
      firestoreRows = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name || "",
          meetingId: data.meetingId || undefined,
          gmail: data.gmail || "",
          ip: data.ip || "Unknown",
          deviceId: data.deviceId || "Unknown",
          uid: data.uid || "Unknown",
          browserFingerprint: data.browserFingerprint || "",
          userAgent: data.userAgent || "",
          joinedAt: normalizeIsoTimestamp(data.joinedAt),
          blocked: data.blocked === true,
        };
      });
    } catch (fsErr) {
      console.warn("Firestore getDemoParticipants fallback notice:", fsErr);
    }
  }

  if (supabaseRows !== null || firestoreRows !== null) {
    const merged = dedupeByKey(
      [...(supabaseRows || []), ...(firestoreRows || [])],
      (p) => p.id
    );
    merged.sort(
      (a, b) => toTimestampMs(b.joinedAt) - toTimestampMs(a.joinedAt)
    );
    try {
      localStorage.setItem("ue_cache_demo_participants", JSON.stringify(merged));
    } catch (e) {}
    return merged;
  }

  try {
    const cached = localStorage.getItem("ue_cache_demo_participants");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return dedupeByKey(parsed as DemoParticipantDoc[], (p) => p.id);
      }
    }
  } catch (e) {}
  return [];
}

export async function saveDemoParticipant(
  p: DemoParticipantDoc
): Promise<boolean> {
  const payload = {
    id: p.id,
    name: p.name,
    meetingId: p.meetingId || null,
    gmail: p.gmail || null,
    ip: p.ip || "Unknown",
    deviceId: p.deviceId || "Unknown",
    uid: p.uid || "Unknown",
    browserFingerprint: p.browserFingerprint || null,
    userAgent: p.userAgent || null,
    joinedAt: p.joinedAt || new Date().toISOString(),
    blocked: p.blocked === true,
  };

  try {
    const existingStr = localStorage.getItem("ue_cache_demo_participants");
    let list: DemoParticipantDoc[] = existingStr ? JSON.parse(existingStr) : [];
    list = dedupeByKey(
      [payload, ...list.filter((x) => x.id !== p.id)],
      (x) => x.id
    );
    localStorage.setItem("ue_cache_demo_participants", JSON.stringify(list));
  } catch (e) {}

  const supabasePromise = (async () => {
    try {
      const { error } = await supabase.from("demo_participants").upsert(payload);
      if (error) {
        console.warn("Supabase saveDemoParticipant error:", error.message || error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn("Supabase saveDemoParticipant exception:", err);
      return false;
    }
  })();

  const firestorePromise = (async () => {
    try {
      await setDoc(doc(db, "demoParticipants", safeDocId(payload.id)), payload, {
        merge: true,
      });
      return true;
    } catch (err) {
      return false;
    }
  })();

  const allResult = await Promise.race([
    Promise.all([supabasePromise, firestorePromise]).then(([s, f]) => s || f),
    new Promise<boolean>((resolve) => {
      let resolved = false;
      supabasePromise.then((ok) => {
        if (ok && !resolved) {
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(true);
            }
          }, 450);
        }
      });
      firestorePromise.then((ok) => {
        if (ok && !resolved) {
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(true);
            }
          }, 450);
        }
      });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, 4500);
    }),
  ]);

  return allResult;
}

export async function markDemoParticipantBlocked(
  id: string,
  blocked: boolean
): Promise<void> {
  try {
    await supabase.from("demo_participants").update({ blocked }).eq("id", id);
  } catch (e) {}
  try {
    await updateDoc(doc(db, "demoParticipants", safeDocId(id)), { blocked });
  } catch (e) {}
  try {
    const existingStr = localStorage.getItem("ue_cache_demo_participants");
    if (existingStr) {
      const list: DemoParticipantDoc[] = JSON.parse(existingStr);
      const updated = list.map((d) => (d.id === id ? { ...d, blocked } : d));
      localStorage.setItem("ue_cache_demo_participants", JSON.stringify(updated));
    }
  } catch (e) {}
}

export async function deleteDemoParticipant(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("demo_participants")
      .delete()
      .eq("id", id);
    if (error) console.error("Supabase deleteDemoParticipant error:", error);
    await deleteDoc(doc(db, "demoParticipants", safeDocId(id))).catch(() => {});

    try {
      const existingStr = localStorage.getItem("ue_cache_demo_participants");
      if (existingStr) {
        let list: DemoParticipantDoc[] = JSON.parse(existingStr);
        list = list.filter((d) => d.id !== id);
        localStorage.setItem("ue_cache_demo_participants", JSON.stringify(list));
      }
    } catch (e) {}
    return true;
  } catch (err) {
    console.warn("Supabase deleteDemoParticipant notice:", err);
    return false;
  }
}

export async function deleteAllDemoParticipants(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("demo_participants")
      .delete()
      .neq("id", "___impossible_val___");
    if (error) console.error("Supabase deleteAllDemoParticipants error:", error);
  } catch (err) {
    console.warn("Supabase deleteAllDemoParticipants notice:", err);
  }

  try {
    localStorage.removeItem("ue_cache_demo_participants");
  } catch (e) {}
  return true;
}

export function subscribeDemoParticipants(
  onUpdate: (demoList: DemoParticipantDoc[]) => void
) {
  let latestSupabase: DemoParticipantDoc[] | null = null;
  let latestFirestore: DemoParticipantDoc[] | null = null;

  const emitMerged = () => {
    if (latestSupabase === null && latestFirestore === null) return;
    const merged = dedupeByKey(
      [...(latestSupabase || []), ...(latestFirestore || [])],
      (p) => p.id
    );
    merged.sort(
      (a, b) => toTimestampMs(b.joinedAt) - toTimestampMs(a.joinedAt)
    );
    try {
      localStorage.setItem("ue_cache_demo_participants", JSON.stringify(merged));
    } catch (e) {}
    onUpdate(merged);
  };

  const fetchSupabaseOnly = async () => {
    const rows = await fetchAllRows<DemoParticipantDoc>(
      "demo_participants",
      "joinedAt"
    );
    if (rows !== null) {
      latestSupabase = rows;
      emitMerged();
    }
  };

  fetchSupabaseOnly();

  const channel = supabase
    .channel("realtime_demo_participants")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "demo_participants" },
      () => {
        fetchSupabaseOnly();
      }
    )
    .subscribe();

  let unsubFirestore: (() => void) | null = null;
  if (auth.currentUser) {
    unsubFirestore = onSnapshot(
      collection(db, "demoParticipants"),
      (snap) => {
        latestFirestore = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || "",
            meetingId: data.meetingId || undefined,
            gmail: data.gmail || "",
            ip: data.ip || "Unknown",
            deviceId: data.deviceId || "Unknown",
            uid: data.uid || "Unknown",
            browserFingerprint: data.browserFingerprint || "",
            userAgent: data.userAgent || "",
            joinedAt: normalizeIsoTimestamp(data.joinedAt),
            blocked: data.blocked === true,
          };
        });
        emitMerged();
      },
      () => {}
    );
  }

  return () => {
    supabase.removeChannel(channel);
    if (unsubFirestore) unsubFirestore();
  };
}

// -------------------------------------------------------------
// BLOCKED IPS, DEVICES & UIDS (Dual-Persisted & Strictly Enforced)
// -------------------------------------------------------------
export async function getBlockedIPs(): Promise<BlockedIPDoc[]> {
  let supabaseRows: BlockedIPDoc[] | null = null;
  let firestoreRows: BlockedIPDoc[] | null = null;

  try {
    const { data, error } = await supabase.from("blocked_ips").select("*");
    if (!error && data) {
      supabaseRows = data as BlockedIPDoc[];
    }
  } catch (err) {
    console.warn("Supabase getBlockedIPs notice:", err);
  }

  if (auth.currentUser) {
    try {
      const snap = await getDocs(collection(db, "blockedIPs"));
      firestoreRows = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          ip: data.ip || d.id,
          name: data.name || undefined,
          deviceId: data.deviceId || undefined,
          uid: data.uid || undefined,
          browserFingerprint: data.browserFingerprint || undefined,
          reason: data.reason || "Blocked by Admin",
          blockedAt: normalizeIsoTimestamp(data.blockedAt),
        };
      });
    } catch (e) {}
  }

  if (supabaseRows !== null || firestoreRows !== null) {
    const merged = dedupeByKey(
      [...(supabaseRows || []), ...(firestoreRows || [])].filter((b) =>
        isValidIdentifier(b.ip)
      ),
      (b) => b.ip
    );
    try {
      localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(merged));
    } catch (e) {}
    return merged;
  }

  try {
    const cached = localStorage.getItem("ue_cache_blocked_ips");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return dedupeByKey(
          (parsed as BlockedIPDoc[]).filter((b) => isValidIdentifier(b.ip)),
          (b) => b.ip
        );
      }
    }
  } catch (e) {}
  return [];
}

export async function blockIP(record: BlockedIPDoc): Promise<boolean> {
  if (!isValidIdentifier(record.ip)) return false;
  const cleanIp = record.ip.trim();

  const payload: any = {
    ip: cleanIp,
    name: record.name || null,
    deviceId: record.deviceId || null,
    uid: record.uid || null,
    browserFingerprint: record.browserFingerprint || null,
    reason: record.reason || "Blocked by Admin",
    blockedAt: record.blockedAt || new Date().toISOString(),
  };

  try {
    const existingStr = localStorage.getItem("ue_cache_blocked_ips");
    let list: BlockedIPDoc[] = existingStr ? JSON.parse(existingStr) : [];
    list = dedupeByKey(
      [payload, ...list.filter((x) => x.ip !== cleanIp)],
      (x) => x.ip
    );
    localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(list));
  } catch (e) {}

  const supabasePromise = (async () => {
    try {
      const { error } = await supabase.from("blocked_ips").upsert(payload);
      if (error) {
        await supabase.from("blocked_ips").upsert({
          ip: cleanIp,
          blockedAt: payload.blockedAt,
        });
      }
      return true;
    } catch (err) {
      console.warn("Supabase blockIP notice:", err);
      return false;
    }
  })();

  const firestorePromise = setDoc(
    doc(db, "blockedIPs", safeDocId(cleanIp)),
    payload,
    { merge: true }
  )
    .then(() => true)
    .catch(() => false);

  await Promise.race([
    Promise.allSettled([supabasePromise, firestorePromise]),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);

  return true;
}

export async function unblockIP(ip: string): Promise<boolean> {
  if (!isValidIdentifier(ip)) return false;
  const cleanIp = ip.trim();

  try {
    const existingStr = localStorage.getItem("ue_cache_blocked_ips");
    if (existingStr) {
      let list: BlockedIPDoc[] = JSON.parse(existingStr);
      list = list.filter((b) => b.ip !== cleanIp);
      localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(list));
    }
  } catch (e) {}

  await Promise.allSettled([
    supabase.from("blocked_ips").delete().eq("ip", cleanIp),
    deleteDoc(doc(db, "blockedIPs", safeDocId(cleanIp))),
  ]);

  return true;
}

export async function blockDevice(
  deviceId: string,
  ip?: string,
  uid?: string
): Promise<boolean> {
  if (!isValidIdentifier(deviceId)) return false;
  const cleanDev = deviceId.trim();
  const payload = {
    deviceId: cleanDev,
    ip: isValidIdentifier(ip) ? ip.trim() : null,
    uid: isValidIdentifier(uid) ? uid.trim() : null,
    blockedAt: new Date().toISOString(),
  };

  try {
    const existingStr = localStorage.getItem("ue_cache_blocked_devices");
    let list: any[] = existingStr ? JSON.parse(existingStr) : [];
    list = dedupeByKey(
      [payload, ...list.filter((d) => d.deviceId !== cleanDev)],
      (d) => d.deviceId
    );
    localStorage.setItem("ue_cache_blocked_devices", JSON.stringify(list));
  } catch (e) {}

  const supabasePromise = (async () => {
    try {
      const { error } = await supabase.from("blocked_devices").upsert(payload);
      if (error) {
        await supabase.from("blocked_devices").upsert({ deviceId: cleanDev });
      }
    } catch (err) {
      console.warn("Supabase blockDevice notice:", err);
    }
  })();

  const firestorePromise = setDoc(
    doc(db, "blockedDevices", safeDocId(cleanDev)),
    payload,
    { merge: true }
  ).catch(() => {});

  await Promise.race([
    Promise.allSettled([supabasePromise, firestorePromise]),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);

  return true;
}

export async function unblockDevice(deviceId: string): Promise<boolean> {
  if (!isValidIdentifier(deviceId)) return false;
  const cleanDev = deviceId.trim();

  try {
    const existingStr = localStorage.getItem("ue_cache_blocked_devices");
    if (existingStr) {
      const list = JSON.parse(existingStr).filter(
        (d: any) => d.deviceId !== cleanDev
      );
      localStorage.setItem("ue_cache_blocked_devices", JSON.stringify(list));
    }
  } catch (e) {}

  await Promise.allSettled([
    supabase.from("blocked_devices").delete().eq("deviceId", cleanDev),
    deleteDoc(doc(db, "blockedDevices", safeDocId(cleanDev))),
  ]);

  return true;
}

export async function blockUID(
  uid: string,
  ip?: string,
  deviceId?: string
): Promise<boolean> {
  if (!isValidIdentifier(uid)) return false;
  const cleanUid = uid.trim();
  const payload = {
    uid: cleanUid,
    ip: isValidIdentifier(ip) ? ip.trim() : null,
    deviceId: isValidIdentifier(deviceId) ? deviceId.trim() : null,
    blockedAt: new Date().toISOString(),
  };

  try {
    const existingStr = localStorage.getItem("ue_cache_blocked_uids");
    let list: any[] = existingStr ? JSON.parse(existingStr) : [];
    list = dedupeByKey(
      [payload, ...list.filter((u) => u.uid !== cleanUid)],
      (u) => u.uid
    );
    localStorage.setItem("ue_cache_blocked_uids", JSON.stringify(list));
  } catch (e) {}

  const supabasePromise = (async () => {
    try {
      const { error } = await supabase.from("blocked_uids").upsert(payload);
      if (error) {
        await supabase.from("blocked_uids").upsert({ uid: cleanUid });
      }
    } catch (err) {
      console.warn("Supabase blockUID notice:", err);
    }
  })();

  const firestorePromise = setDoc(
    doc(db, "blockedUIDs", safeDocId(cleanUid)),
    payload,
    { merge: true }
  ).catch(() => {});

  await Promise.race([
    Promise.allSettled([supabasePromise, firestorePromise]),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);

  return true;
}

export async function unblockUID(uid: string): Promise<boolean> {
  if (!isValidIdentifier(uid)) return false;
  const cleanUid = uid.trim();

  try {
    const existingStr = localStorage.getItem("ue_cache_blocked_uids");
    if (existingStr) {
      const list = JSON.parse(existingStr).filter((u: any) => u.uid !== cleanUid);
      localStorage.setItem("ue_cache_blocked_uids", JSON.stringify(list));
    }
  } catch (e) {}

  await Promise.allSettled([
    supabase.from("blocked_uids").delete().eq("uid", cleanUid),
    deleteDoc(doc(db, "blockedUIDs", safeDocId(cleanUid))),
  ]);

  return true;
}

export async function resetAllBlocks(): Promise<boolean> {
  try {
    localStorage.removeItem("ue_cache_blocked_ips");
    localStorage.removeItem("ue_cache_blocked_devices");
    localStorage.removeItem("ue_cache_blocked_uids");

    try {
      const pStr = localStorage.getItem("ue_cache_participants");
      if (pStr) {
        const pList = JSON.parse(pStr).map((p: any) => ({ ...p, blocked: false }));
        localStorage.setItem("ue_cache_participants", JSON.stringify(pList));
      }
      const dStr = localStorage.getItem("ue_cache_demo_participants");
      if (dStr) {
        const dList = JSON.parse(dStr).map((d: any) => ({ ...d, blocked: false }));
        localStorage.setItem("ue_cache_demo_participants", JSON.stringify(dList));
      }
    } catch (cacheErr) {}
  } catch (e) {}

  try {
    await Promise.allSettled([
      supabase.from("blocked_ips").delete().neq("ip", "___impossible_reset_val___"),
      supabase
        .from("blocked_devices")
        .delete()
        .neq("deviceId", "___impossible_reset_val___"),
      supabase.from("blocked_uids").delete().neq("uid", "___impossible_reset_val___"),
      supabase.from("participants").update({ blocked: false }).eq("blocked", true),
      supabase
        .from("demo_participants")
        .update({ blocked: false })
        .eq("blocked", true),
    ]);
  } catch (err) {
    console.warn("resetAllBlocks notice:", err);
  }
  return true;
}

export async function isIPBlocked(ip: string): Promise<boolean> {
  if (!isValidIdentifier(ip)) return false;
  const cleanIp = ip.trim();

  let sbQuerySucceeded = false;
  try {
    const { data, error } = await supabase
      .from("blocked_ips")
      .select("ip")
      .eq("ip", cleanIp)
      .maybeSingle();
    if (!error) {
      sbQuerySucceeded = true;
      if (data) return true;
    }
  } catch {}

  if (!sbQuerySucceeded) {
    try {
      const snap = await getDoc(doc(db, "blockedIPs", safeDocId(cleanIp)));
      if (snap.exists()) return true;
    } catch {}
  }

  try {
    const cached = localStorage.getItem("ue_cache_blocked_ips");
    if (cached) {
      const list: BlockedIPDoc[] = JSON.parse(cached);
      return list.some((b) => b.ip === cleanIp);
    }
  } catch (e) {}
  return false;
}

export async function isDeviceBlocked(deviceId: string): Promise<boolean> {
  if (!isValidIdentifier(deviceId)) return false;
  const cleanDev = deviceId.trim();

  let sbQuerySucceeded = false;
  try {
    const { data, error } = await supabase
      .from("blocked_devices")
      .select("deviceId")
      .eq("deviceId", cleanDev)
      .maybeSingle();
    if (!error) {
      sbQuerySucceeded = true;
      if (data) return true;
    }
  } catch {}

  if (!sbQuerySucceeded) {
    try {
      const snap = await getDoc(
        doc(db, "blockedDevices", safeDocId(cleanDev))
      );
      if (snap.exists()) return true;
    } catch {}
  }

  try {
    const cached = localStorage.getItem("ue_cache_blocked_devices");
    if (cached) {
      const list: any[] = JSON.parse(cached);
      return list.some((b) => b.deviceId === cleanDev);
    }
  } catch (e) {}
  return false;
}

export async function isUIDBlocked(uid: string): Promise<boolean> {
  if (!isValidIdentifier(uid)) return false;
  const cleanUid = uid.trim();

  let sbQuerySucceeded = false;
  try {
    const { data, error } = await supabase
      .from("blocked_uids")
      .select("uid")
      .eq("uid", cleanUid)
      .maybeSingle();
    if (!error) {
      sbQuerySucceeded = true;
      if (data) return true;
    }
  } catch {}

  if (!sbQuerySucceeded) {
    try {
      const snap = await getDoc(doc(db, "blockedUIDs", safeDocId(cleanUid)));
      if (snap.exists()) return true;
    } catch {}
  }

  try {
    const cached = localStorage.getItem("ue_cache_blocked_uids");
    if (cached) {
      const list: any[] = JSON.parse(cached);
      return list.some((b) => b.uid === cleanUid);
    }
  } catch (e) {}
  return false;
}

export function subscribeBlockedIPs(onUpdate: (list: BlockedIPDoc[]) => void) {
  let latestSupabase: BlockedIPDoc[] | null = null;
  let latestFirestore: BlockedIPDoc[] | null = null;

  const emitMerged = () => {
    if (latestSupabase === null && latestFirestore === null) return;
    const merged = dedupeByKey(
      [...(latestSupabase || []), ...(latestFirestore || [])].filter((b) =>
        isValidIdentifier(b.ip)
      ),
      (b) => b.ip
    );
    try {
      localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(merged));
    } catch (e) {}
    onUpdate(merged);
  };

  const fetchSupabaseOnly = async () => {
    try {
      const { data, error } = await supabase.from("blocked_ips").select("*");
      if (!error && data) {
        latestSupabase = data as BlockedIPDoc[];
        emitMerged();
      }
    } catch (err) {
      console.warn("Supabase subscribeBlockedIPs notice:", err);
    }
  };

  fetchSupabaseOnly();

  const channel = supabase
    .channel("realtime_blocked_ips")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "blocked_ips" },
      () => {
        fetchSupabaseOnly();
      }
    )
    .subscribe();

  let unsubFirestore: (() => void) | null = null;
  if (auth.currentUser) {
    unsubFirestore = onSnapshot(
      collection(db, "blockedIPs"),
      (snap) => {
        latestFirestore = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            ip: data.ip || d.id,
            name: data.name || undefined,
            deviceId: data.deviceId || undefined,
            uid: data.uid || undefined,
            browserFingerprint: data.browserFingerprint || undefined,
            reason: data.reason || "Blocked by Admin",
            blockedAt: normalizeIsoTimestamp(data.blockedAt),
          };
        });
        emitMerged();
      },
      () => {}
    );
  }

  return () => {
    supabase.removeChannel(channel);
    if (unsubFirestore) unsubFirestore();
  };
}

export async function getBlockedDevices(): Promise<{ deviceId: string }[]> {
  let supabaseRows: { deviceId: string }[] | null = null;
  let firestoreRows: { deviceId: string }[] | null = null;

  try {
    const { data, error } = await supabase.from("blocked_devices").select("*");
    if (!error && data) {
      supabaseRows = data as { deviceId: string }[];
    }
  } catch (err) {
    console.warn("getBlockedDevices notice:", err);
  }

  if (auth.currentUser) {
    try {
      const snap = await getDocs(collection(db, "blockedDevices"));
      firestoreRows = snap.docs.map((d) => ({
        deviceId: (d.data() as any)?.deviceId || d.id,
        ...(d.data() as any),
      }));
    } catch (e) {}
  }

  if (supabaseRows !== null || firestoreRows !== null) {
    const merged = dedupeByKey(
      [...(supabaseRows || []), ...(firestoreRows || [])].filter((d) =>
        isValidIdentifier(d.deviceId)
      ),
      (d) => d.deviceId
    );
    try {
      localStorage.setItem("ue_cache_blocked_devices", JSON.stringify(merged));
    } catch (e) {}
    return merged;
  }

  try {
    const cached = localStorage.getItem("ue_cache_blocked_devices");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return dedupeByKey(
          (parsed as { deviceId: string }[]).filter((d) =>
            isValidIdentifier(d.deviceId)
          ),
          (d) => d.deviceId
        );
      }
    }
  } catch (e) {}
  return [];
}

export function subscribeBlockedDevices(
  onUpdate: (list: { deviceId: string }[]) => void
) {
  let latestSupabase: { deviceId: string }[] | null = null;
  let latestFirestore: { deviceId: string }[] | null = null;

  const emitMerged = () => {
    if (latestSupabase === null && latestFirestore === null) return;
    const merged = dedupeByKey(
      [...(latestSupabase || []), ...(latestFirestore || [])].filter((d) =>
        isValidIdentifier(d.deviceId)
      ),
      (d) => d.deviceId
    );
    try {
      localStorage.setItem("ue_cache_blocked_devices", JSON.stringify(merged));
    } catch (e) {}
    onUpdate(merged);
  };

  const fetchSupabaseOnly = async () => {
    try {
      const { data, error } = await supabase.from("blocked_devices").select("*");
      if (!error && data) {
        latestSupabase = data as { deviceId: string }[];
        emitMerged();
      }
    } catch (err) {
      console.warn("Supabase subscribeBlockedDevices notice:", err);
    }
  };

  fetchSupabaseOnly();

  const channel = supabase
    .channel("realtime_blocked_devices")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "blocked_devices" },
      () => {
        fetchSupabaseOnly();
      }
    )
    .subscribe();

  let unsubFirestore: (() => void) | null = null;
  if (auth.currentUser) {
    unsubFirestore = onSnapshot(
      collection(db, "blockedDevices"),
      (snap) => {
        latestFirestore = snap.docs.map((d) => ({
          deviceId: (d.data() as any)?.deviceId || d.id,
          ...(d.data() as any),
        }));
        emitMerged();
      },
      () => {}
    );
  }

  return () => {
    supabase.removeChannel(channel);
    if (unsubFirestore) unsubFirestore();
  };
}

export async function getBlockedUIDs(): Promise<{ uid: string }[]> {
  let supabaseRows: { uid: string }[] | null = null;
  let firestoreRows: { uid: string }[] | null = null;

  try {
    const { data, error } = await supabase.from("blocked_uids").select("*");
    if (!error && data) {
      supabaseRows = data as { uid: string }[];
    }
  } catch (err) {
    console.warn("getBlockedUIDs notice:", err);
  }

  if (auth.currentUser) {
    try {
      const snap = await getDocs(collection(db, "blockedUIDs"));
      firestoreRows = snap.docs.map((d) => ({
        uid: (d.data() as any)?.uid || d.id,
        ...(d.data() as any),
      }));
    } catch (e) {}
  }

  if (supabaseRows !== null || firestoreRows !== null) {
    const merged = dedupeByKey(
      [...(supabaseRows || []), ...(firestoreRows || [])].filter((u) =>
        isValidIdentifier(u.uid)
      ),
      (u) => u.uid
    );
    try {
      localStorage.setItem("ue_cache_blocked_uids", JSON.stringify(merged));
    } catch (e) {}
    return merged;
  }

  try {
    const cached = localStorage.getItem("ue_cache_blocked_uids");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return dedupeByKey(
          (parsed as { uid: string }[]).filter((u) =>
            isValidIdentifier(u.uid)
          ),
          (u) => u.uid
        );
      }
    }
  } catch (e) {}
  return [];
}

export function subscribeBlockedUIDs(onUpdate: (list: { uid: string }[]) => void) {
  let latestSupabase: { uid: string }[] | null = null;
  let latestFirestore: { uid: string }[] | null = null;

  const emitMerged = () => {
    if (latestSupabase === null && latestFirestore === null) return;
    const merged = dedupeByKey(
      [...(latestSupabase || []), ...(latestFirestore || [])].filter((u) =>
        isValidIdentifier(u.uid)
      ),
      (u) => u.uid
    );
    try {
      localStorage.setItem("ue_cache_blocked_uids", JSON.stringify(merged));
    } catch (e) {}
    onUpdate(merged);
  };

  const fetchSupabaseOnly = async () => {
    try {
      const { data, error } = await supabase.from("blocked_uids").select("*");
      if (!error && data) {
        latestSupabase = data as { uid: string }[];
        emitMerged();
      }
    } catch (err) {
      console.warn("Supabase subscribeBlockedUIDs notice:", err);
    }
  };

  fetchSupabaseOnly();

  const channel = supabase
    .channel("realtime_blocked_uids")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "blocked_uids" },
      () => {
        fetchSupabaseOnly();
      }
    )
    .subscribe();

  let unsubFirestore: (() => void) | null = null;
  if (auth.currentUser) {
    unsubFirestore = onSnapshot(
      collection(db, "blockedUIDs"),
      (snap) => {
        latestFirestore = snap.docs.map((d) => ({
          uid: (d.data() as any)?.uid || d.id,
          ...(d.data() as any),
        }));
        emitMerged();
      },
      () => {}
    );
  }

  return () => {
    supabase.removeChannel(channel);
    if (unsubFirestore) unsubFirestore();
  };
}

// -------------------------------------------------------------
// SETTINGS (Synced across Supabase + Firestore)
// -------------------------------------------------------------
export async function getAdminSettings(): Promise<AdminSettingsDoc | null> {
  let cached: AdminSettingsDoc | null = null;
  try {
    const cachedStr = localStorage.getItem("ue_cache_settings");
    if (cachedStr) cached = JSON.parse(cachedStr);
  } catch (e) {}

  let sbData: AdminSettingsDoc | null = null;
  try {
    const { data, error } = await supabase
      .from("admin_settings")
      .select("*")
      .eq("id", "settings")
      .maybeSingle();
    if (!error && data) {
      sbData = data as AdminSettingsDoc;
    }
  } catch (err) {
    console.warn("Supabase getAdminSettings notice:", err);
  }

  if (sbData) {
    const merged = { ...cached, ...sbData };
    try {
      localStorage.setItem("ue_cache_settings", JSON.stringify(merged));
    } catch (e) {}
    return merged as AdminSettingsDoc;
  }

  let fsData: AdminSettingsDoc | null = null;
  try {
    const snap = await getDoc(doc(db, "adminSettings", "settings"));
    if (snap.exists()) {
      fsData = snap.data() as AdminSettingsDoc;
    }
  } catch (err) {}

  if (fsData) {
    const merged = { ...cached, ...fsData };
    try {
      localStorage.setItem("ue_cache_settings", JSON.stringify(merged));
    } catch (e) {}
    return merged as AdminSettingsDoc;
  }

  return cached;
}

export async function saveAdminSettings(
  settings: Partial<AdminSettingsDoc>
): Promise<boolean> {
  const payload = {
    id: "settings",
    ...settings,
    updatedAt: new Date().toISOString(),
  };

  try {
    const existingStr = localStorage.getItem("ue_cache_settings");
    const existing = existingStr ? JSON.parse(existingStr) : {};
    const merged = { ...existing, ...payload };
    localStorage.setItem("ue_cache_settings", JSON.stringify(merged));
  } catch (e) {}

  const fsPayload = { ...settings };
  const firestorePromise = setDoc(
    doc(db, "adminSettings", "settings"),
    fsPayload,
    { merge: true }
  ).catch(() => {});

  const supabasePromise = (async () => {
    try {
      const { error } = await supabase.from("admin_settings").upsert(payload);
      if (error) {
        console.warn("Supabase saveAdminSettings notice:", error.message || error);
        // Fallback if live Supabase table lacks blockSystemActive column
        if ("blockSystemActive" in payload) {
          const { blockSystemActive: _omit, ...restPayload } = payload as any;
          if (Object.keys(restPayload).length > 2) {
            await supabase.from("admin_settings").upsert(restPayload);
          }
        }
      }
    } catch (err) {
      console.warn("Supabase saveAdminSettings notice:", err);
    }
  })();

  await Promise.race([
    Promise.allSettled([firestorePromise, supabasePromise]),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);

  return true;
}

export function subscribeAdminSettings(
  onUpdate: (settings: AdminSettingsDoc) => void
) {
  let latestSupabase: AdminSettingsDoc | null = null;
  let latestFirestore: AdminSettingsDoc | null = null;

  const emitMerged = () => {
    if (!latestSupabase && !latestFirestore) return;
    let cached: AdminSettingsDoc | null = null;
    try {
      const cachedStr = localStorage.getItem("ue_cache_settings");
      if (cachedStr) cached = JSON.parse(cachedStr);
    } catch (e) {}
    const merged = {
      ...(cached || {}),
      ...(latestSupabase || {}),
      ...(latestFirestore || {}),
    } as AdminSettingsDoc;
    try {
      localStorage.setItem("ue_cache_settings", JSON.stringify(merged));
    } catch (e) {}
    onUpdate(merged);
  };

  const fetchSupabaseOnly = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_settings")
        .select("*")
        .eq("id", "settings")
        .maybeSingle();
      if (!error && data) {
        latestSupabase = data as AdminSettingsDoc;
        emitMerged();
      }
    } catch (err) {
      console.warn("Supabase subscribeAdminSettings notice:", err);
    }
  };

  fetchSupabaseOnly();

  const channel = supabase
    .channel("realtime_admin_settings")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "admin_settings" },
      () => {
        fetchSupabaseOnly();
      }
    )
    .subscribe();

  const unsubFirestore = onSnapshot(
    doc(db, "adminSettings", "settings"),
    (snap) => {
      if (snap.exists()) {
        latestFirestore = snap.data() as AdminSettingsDoc;
        emitMerged();
      }
    },
    () => {}
  );

  return () => {
    supabase.removeChannel(channel);
    unsubFirestore();
  };
}
