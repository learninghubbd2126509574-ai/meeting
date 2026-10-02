import { supabase } from "./supabase";

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
  blockSystemActive?: boolean; // When true: block system filters users; When false: ANY blocked user can join!
}

// -------------------------------------------------------------
// MEETINGS
// -------------------------------------------------------------
export async function getMeetings(): Promise<MeetingDoc[]> {
  try {
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .order("createdAt", { ascending: false });

    if (!error && data) {
      try {
        localStorage.setItem("ue_cache_meetings", JSON.stringify(data));
      } catch (e) {}
      return data as MeetingDoc[];
    }
  } catch (err) {
    console.warn("Supabase getMeetings notice:", err);
  }

  // LocalStorage fallback for temporary cache
  try {
    const cached = localStorage.getItem("ue_cache_meetings");
    if (cached) return JSON.parse(cached);
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

    const { error } = await supabase.from("meetings").upsert(payload);
    if (error) {
      console.warn("Supabase saveMeeting notice:", error.message || error);
    }

    try {
      const existingStr = localStorage.getItem("ue_cache_meetings");
      let existingList: MeetingDoc[] = existingStr ? JSON.parse(existingStr) : [];
      existingList = [payload, ...existingList.filter((m) => m.id !== meeting.id)];
      localStorage.setItem("ue_cache_meetings", JSON.stringify(existingList));
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn("Supabase saveMeeting notice:", err);
    return false;
  }
}

export async function updateMeetingStatus(id: string, active: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("meetings")
      .update({ active })
      .eq("id", id);

    if (error) console.warn("Supabase updateMeetingStatus notice:", error.message || error);

    try {
      const existingStr = localStorage.getItem("ue_cache_meetings");
      if (existingStr) {
        let existingList: MeetingDoc[] = JSON.parse(existingStr);
        existingList = existingList.map((m) => (m.id === id ? { ...m, active } : m));
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
    const { error } = await supabase.from("meetings").delete().neq("id", "");
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
  // Initial load
  getMeetings().then((list) => {
    if (list) onUpdate(list);
  });

  const channel = supabase
    .channel("realtime_meetings")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "meetings" },
      async () => {
        const updated = await getMeetings();
        onUpdate(updated);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// -------------------------------------------------------------
// PARTICIPANTS
// -------------------------------------------------------------
export async function getParticipants(): Promise<ParticipantDoc[]> {
  try {
    const { data, error } = await supabase
      .from("participants")
      .select("*")
      .order("joinedAt", { ascending: false });

    if (!error && data) {
      try {
        localStorage.setItem("ue_cache_participants", JSON.stringify(data));
      } catch (e) {}
      return data as ParticipantDoc[];
    }
  } catch (err) {
    console.warn("Supabase getParticipants notice:", err);
  }

  try {
    const cached = localStorage.getItem("ue_cache_participants");
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return [];
}

export async function saveParticipant(p: ParticipantDoc): Promise<boolean> {
  try {
    const payload = {
      id: p.id,
      meetingId: p.meetingId || null,
      name: p.name,
      ip: p.ip || null,
      deviceId: p.deviceId || null,
      uid: p.uid || null,
      browserFingerprint: p.browserFingerprint || null,
      userAgent: p.userAgent || null,
      joinedAt: p.joinedAt || new Date().toISOString(),
      blocked: p.blocked || false,
    };

    const { error } = await supabase.from("participants").upsert(payload);
    if (error) console.error("Supabase saveParticipant error:", error);

    try {
      const existingStr = localStorage.getItem("ue_cache_participants");
      let list: ParticipantDoc[] = existingStr ? JSON.parse(existingStr) : [];
      list = [payload, ...list.filter((x) => x.id !== p.id)];
      localStorage.setItem("ue_cache_participants", JSON.stringify(list));
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn("Supabase saveParticipant notice:", err);
    return false;
  }
}

export async function deleteParticipant(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("participants").delete().eq("id", id);
    if (error) console.error("Supabase deleteParticipant error:", error);

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
    const { error } = await supabase.from("participants").delete().neq("id", "");
    if (error) console.error("Supabase deleteAllParticipants error:", error);
  } catch (err) {
    console.warn("Supabase deleteAllParticipants notice:", err);
  }

  try {
    localStorage.removeItem("ue_cache_participants");
  } catch (e) {}
  return true;
}

export function subscribeParticipants(onUpdate: (participants: ParticipantDoc[]) => void) {
  getParticipants().then((list) => {
    if (list) onUpdate(list);
  });

  const channel = supabase
    .channel("realtime_participants")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "participants" },
      async () => {
        const updated = await getParticipants();
        onUpdate(updated);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// -------------------------------------------------------------
// DEMO PARTICIPANTS
// -------------------------------------------------------------
export async function getDemoParticipants(): Promise<DemoParticipantDoc[]> {
  try {
    const { data, error } = await supabase
      .from("demo_participants")
      .select("*")
      .order("joinedAt", { ascending: false });

    if (!error && data) {
      try {
        localStorage.setItem("ue_cache_demo_participants", JSON.stringify(data));
      } catch (e) {}
      return data as DemoParticipantDoc[];
    }
  } catch (err) {
    console.warn("Supabase getDemoParticipants notice:", err);
  }

  try {
    const cached = localStorage.getItem("ue_cache_demo_participants");
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return [];
}

export async function saveDemoParticipant(p: DemoParticipantDoc): Promise<boolean> {
  try {
    const payload = {
      id: p.id,
      name: p.name,
      meetingId: p.meetingId || null,
      gmail: p.gmail || null,
      ip: p.ip || null,
      deviceId: p.deviceId || null,
      uid: p.uid || null,
      browserFingerprint: p.browserFingerprint || null,
      userAgent: p.userAgent || null,
      joinedAt: p.joinedAt || new Date().toISOString(),
      blocked: p.blocked || false,
    };

    const { error } = await supabase.from("demo_participants").upsert(payload);
    if (error) console.error("Supabase saveDemoParticipant error:", error);

    try {
      const existingStr = localStorage.getItem("ue_cache_demo_participants");
      let list: DemoParticipantDoc[] = existingStr ? JSON.parse(existingStr) : [];
      list = [payload, ...list.filter((x) => x.id !== p.id)];
      localStorage.setItem("ue_cache_demo_participants", JSON.stringify(list));
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn("Supabase saveDemoParticipant notice:", err);
    return false;
  }
}

export async function deleteDemoParticipant(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("demo_participants").delete().eq("id", id);
    if (error) console.error("Supabase deleteDemoParticipant error:", error);

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
    const { error } = await supabase.from("demo_participants").delete().neq("id", "");
    if (error) console.error("Supabase deleteAllDemoParticipants error:", error);
  } catch (err) {
    console.warn("Supabase deleteAllDemoParticipants notice:", err);
  }

  try {
    localStorage.removeItem("ue_cache_demo_participants");
  } catch (e) {}
  return true;
}

export function subscribeDemoParticipants(onUpdate: (demoList: DemoParticipantDoc[]) => void) {
  getDemoParticipants().then((list) => {
    if (list) onUpdate(list);
  });

  const channel = supabase
    .channel("realtime_demo_participants")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "demo_participants" },
      async () => {
        const updated = await getDemoParticipants();
        onUpdate(updated);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// -------------------------------------------------------------
// BLOCKED IPS, DEVICES & UIDS
// -------------------------------------------------------------
export async function getBlockedIPs(): Promise<BlockedIPDoc[]> {
  try {
    const { data, error } = await supabase.from("blocked_ips").select("*");
    if (!error && data) {
      try {
        localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(data));
      } catch (e) {}
      return data as BlockedIPDoc[];
    }
  } catch (err) {
    console.warn("Supabase getBlockedIPs notice:", err);
  }

  try {
    const cached = localStorage.getItem("ue_cache_blocked_ips");
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return [];
}

export async function blockIP(record: BlockedIPDoc): Promise<boolean> {
  const payload: any = {
    ip: record.ip,
    name: record.name || null,
    deviceId: record.deviceId || null,
    uid: record.uid || null,
    browserFingerprint: record.browserFingerprint || null,
    reason: record.reason || "অ্যাডমিন কর্তৃক ব্লক করা হয়েছে",
    blockedAt: record.blockedAt || new Date().toISOString(),
  };

  try {
    const existingStr = localStorage.getItem("ue_cache_blocked_ips");
    let list: BlockedIPDoc[] = existingStr ? JSON.parse(existingStr) : [];
    list = [payload, ...list.filter((x) => x.ip !== record.ip)];
    localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(list));
  } catch (e) {}

  try {
    const { error } = await supabase.from("blocked_ips").upsert(payload);
    if (error) {
      console.warn("Supabase blockIP notice:", error.message || error);
      // Fallback: try minimal payload if schema columns are missing
      const { error: fallbackError } = await supabase.from("blocked_ips").upsert({
        ip: record.ip,
        blockedAt: payload.blockedAt,
      });
      if (fallbackError) {
        console.warn("Supabase blockIP fallback notice:", fallbackError.message || fallbackError);
      }
    }
    return true;
  } catch (err) {
    console.warn("Supabase blockIP notice:", err);
    return true;
  }
}

export async function unblockIP(ip: string): Promise<boolean> {
  try {
    const existingStr = localStorage.getItem("ue_cache_blocked_ips");
    if (existingStr) {
      let list: BlockedIPDoc[] = JSON.parse(existingStr);
      list = list.filter((b) => b.ip !== ip);
      localStorage.setItem("ue_cache_blocked_ips", JSON.stringify(list));
    }
  } catch (e) {}

  try {
    const { error } = await supabase.from("blocked_ips").delete().eq("ip", ip);
    if (error) console.warn("Supabase unblockIP notice:", error.message || error);
    return true;
  } catch (err) {
    console.warn("Supabase unblockIP notice:", err);
    return true;
  }
}

export async function blockDevice(deviceId: string, ip?: string, uid?: string): Promise<boolean> {
  if (!deviceId || deviceId === "Unknown") return false;
  const payload = {
    deviceId,
    ip: ip || null,
    uid: uid || null,
    blockedAt: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from("blocked_devices").upsert(payload);
    if (error) {
      console.warn("Supabase blockDevice notice:", error.message || error);
      await supabase.from("blocked_devices").upsert({ deviceId });
    }
    return true;
  } catch (err) {
    console.warn("Supabase blockDevice notice:", err);
    return true;
  }
}

export async function unblockDevice(deviceId: string): Promise<boolean> {
  if (!deviceId || deviceId === "Unknown") return false;
  try {
    const { error } = await supabase.from("blocked_devices").delete().eq("deviceId", deviceId);
    if (error) console.warn("Supabase unblockDevice notice:", error.message || error);
    return true;
  } catch (err) {
    console.warn("Supabase unblockDevice notice:", err);
    return true;
  }
}

export async function blockUID(uid: string, ip?: string, deviceId?: string): Promise<boolean> {
  if (!uid || uid === "Unknown") return false;
  const payload = {
    uid,
    ip: ip || null,
    deviceId: deviceId || null,
    blockedAt: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from("blocked_uids").upsert(payload);
    if (error) {
      console.warn("Supabase blockUID notice:", error.message || error);
      await supabase.from("blocked_uids").upsert({ uid });
    }
    return true;
  } catch (err) {
    console.warn("Supabase blockUID notice:", err);
    return true;
  }
}

export async function unblockUID(uid: string): Promise<boolean> {
  if (!uid || uid === "Unknown") return false;
  try {
    const { error } = await supabase.from("blocked_uids").delete().eq("uid", uid);
    if (error) console.warn("Supabase unblockUID notice:", error.message || error);
    return true;
  } catch (err) {
    console.warn("Supabase unblockUID notice:", err);
    return true;
  }
}

export async function resetAllBlocks(): Promise<boolean> {
  try {
    localStorage.removeItem("ue_cache_blocked_ips");
    localStorage.removeItem("ue_cache_blocked_devices");
    localStorage.removeItem("ue_cache_blocked_uids");
    
    // Clear blocked flags from cached participants
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
    // Delete all records from blocked tables in Supabase
    await supabase.from("blocked_ips").delete().neq("ip", "___impossible_reset_val___");
    await supabase.from("blocked_devices").delete().neq("deviceId", "___impossible_reset_val___");
    await supabase.from("blocked_uids").delete().neq("uid", "___impossible_reset_val___");
    // Also reset blocked flag in participants
    await supabase.from("participants").update({ blocked: false }).eq("blocked", true);
    await supabase.from("demo_participants").update({ blocked: false }).eq("blocked", true);
  } catch (err) {
    console.warn("resetAllBlocks notice:", err);
  }
  return true;
}

export async function isIPBlocked(ip: string): Promise<boolean> {
  if (!ip || ip === "Unknown" || ip === "যাচাই হচ্ছে...") return false;
  try {
    const { data } = await supabase
      .from("blocked_ips")
      .select("ip")
      .eq("ip", ip)
      .maybeSingle();

    if (data) return true;
  } catch (err) {
    console.warn("isIPBlocked notice:", err);
  }

  try {
    const cached = localStorage.getItem("ue_cache_blocked_ips");
    if (cached) {
      const list: BlockedIPDoc[] = JSON.parse(cached);
      return list.some((b) => b.ip === ip);
    }
  } catch (e) {}
  return false;
}

export async function isDeviceBlocked(deviceId: string): Promise<boolean> {
  if (!deviceId || deviceId === "Unknown") return false;
  try {
    const { data } = await supabase
      .from("blocked_devices")
      .select("deviceId")
      .eq("deviceId", deviceId)
      .maybeSingle();

    if (data) return true;
  } catch (err) {
    console.warn("isDeviceBlocked notice:", err);
  }
  return false;
}

export async function isUIDBlocked(uid: string): Promise<boolean> {
  if (!uid || uid === "Unknown") return false;
  try {
    const { data } = await supabase
      .from("blocked_uids")
      .select("uid")
      .eq("uid", uid)
      .maybeSingle();

    if (data) return true;
  } catch (err) {
    console.warn("isUIDBlocked notice:", err);
  }
  return false;
}

export function subscribeBlockedIPs(onUpdate: (list: BlockedIPDoc[]) => void) {
  getBlockedIPs().then((list) => {
    if (list) onUpdate(list);
  });

  const channel = supabase
    .channel("realtime_blocked_ips")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "blocked_ips" },
      async () => {
        const updated = await getBlockedIPs();
        onUpdate(updated);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function getBlockedDevices(): Promise<{ deviceId: string }[]> {
  try {
    const { data, error } = await supabase.from("blocked_devices").select("*");
    if (!error && data) {
      return data;
    }
  } catch (err) {
    console.warn("getBlockedDevices notice:", err);
  }
  return [];
}

export function subscribeBlockedDevices(onUpdate: (list: { deviceId: string }[]) => void) {
  getBlockedDevices().then((list) => {
    if (list) onUpdate(list);
  });

  const channel = supabase
    .channel("realtime_blocked_devices")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "blocked_devices" },
      async () => {
        const updated = await getBlockedDevices();
        onUpdate(updated);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function getBlockedUIDs(): Promise<{ uid: string }[]> {
  try {
    const { data, error } = await supabase.from("blocked_uids").select("*");
    if (!error && data) {
      return data;
    }
  } catch (err) {
    console.warn("getBlockedUIDs notice:", err);
  }
  return [];
}

export function subscribeBlockedUIDs(onUpdate: (list: { uid: string }[]) => void) {
  getBlockedUIDs().then((list) => {
    if (list) onUpdate(list);
  });

  const channel = supabase
    .channel("realtime_blocked_uids")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "blocked_uids" },
      async () => {
        const updated = await getBlockedUIDs();
        onUpdate(updated);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// -------------------------------------------------------------
// SETTINGS
// -------------------------------------------------------------
export async function getAdminSettings(): Promise<AdminSettingsDoc | null> {
  let cached: AdminSettingsDoc | null = null;
  try {
    const cachedStr = localStorage.getItem("ue_cache_settings");
    if (cachedStr) cached = JSON.parse(cachedStr);
  } catch (e) {}

  try {
    const { data, error } = await supabase
      .from("admin_settings")
      .select("*")
      .eq("id", "settings")
      .maybeSingle();

    if (!error && data) {
      const merged = { ...cached, ...data };
      try {
        localStorage.setItem("ue_cache_settings", JSON.stringify(merged));
      } catch (e) {}
      return merged as AdminSettingsDoc;
    }
  } catch (err) {
    console.warn("Supabase getAdminSettings notice:", err);
  }
  return cached;
}

export async function saveAdminSettings(settings: Partial<AdminSettingsDoc>): Promise<boolean> {
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

  try {
    const { error } = await supabase.from("admin_settings").upsert(payload);
    if (error) {
      console.warn("Supabase saveAdminSettings notice:", error.message || error);
    }
    return true;
  } catch (err) {
    console.warn("Supabase saveAdminSettings notice:", err);
    return true;
  }
}

export function subscribeAdminSettings(onUpdate: (settings: AdminSettingsDoc) => void) {
  getAdminSettings().then((s) => {
    if (s) onUpdate(s);
  });

  const channel = supabase
    .channel("realtime_admin_settings")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "admin_settings" },
      async () => {
        const updated = await getAdminSettings();
        if (updated) onUpdate(updated);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
