import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://dkghyrwewhncrsbgiwqt.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_I2SYi43bPRY-6aAjNwmkCA_oiN8l1O7";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const SUPABASE_SETUP_SQL = `-- Unity Earning Database Schema for Supabase
-- Run this in Supabase SQL Editor (supabase.com -> SQL Editor -> New Query -> Run)

-- 1. Meetings Table
CREATE TABLE IF NOT EXISTS public.meetings (
  id TEXT PRIMARY KEY,
  "googleMeetLink" TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  "meetingDate" TEXT,
  "meetingTime" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- 2. Participants Table
CREATE TABLE IF NOT EXISTS public.participants (
  id TEXT PRIMARY KEY,
  "meetingId" TEXT,
  name TEXT NOT NULL,
  ip TEXT,
  "deviceId" TEXT,
  uid TEXT,
  "browserFingerprint" TEXT,
  "userAgent" TEXT,
  "joinedAt" TIMESTAMPTZ DEFAULT now(),
  blocked BOOLEAN DEFAULT false
);

-- 3. Demo Participants Table
CREATE TABLE IF NOT EXISTS public.demo_participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "meetingId" TEXT,
  gmail TEXT,
  ip TEXT,
  "deviceId" TEXT,
  uid TEXT,
  "browserFingerprint" TEXT,
  "userAgent" TEXT,
  "joinedAt" TIMESTAMPTZ DEFAULT now(),
  blocked BOOLEAN DEFAULT false
);

-- 4. Blocked IPs Table
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  ip TEXT PRIMARY KEY,
  name TEXT,
  "deviceId" TEXT,
  uid TEXT,
  "browserFingerprint" TEXT,
  reason TEXT,
  "blockedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS uid TEXT;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS "browserFingerprint" TEXT;
ALTER TABLE public.blocked_ips ADD COLUMN IF NOT EXISTS reason TEXT;

-- 5. Blocked Devices Table
CREATE TABLE IF NOT EXISTS public.blocked_devices (
  "deviceId" TEXT PRIMARY KEY,
  ip TEXT,
  uid TEXT,
  "browserFingerprint" TEXT,
  "blockedAt" TIMESTAMPTZ DEFAULT now()
);

-- 6. Blocked UIDs Table
CREATE TABLE IF NOT EXISTS public.blocked_uids (
  uid TEXT PRIMARY KEY,
  ip TEXT,
  "deviceId" TEXT,
  "blockedAt" TIMESTAMPTZ DEFAULT now()
);

-- 7. Admin Settings Table
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id TEXT PRIMARY KEY DEFAULT 'settings',
  password TEXT DEFAULT '4012',
  "preventRepeatJoins" BOOLEAN DEFAULT true,
  "publicLinkActive" BOOLEAN DEFAULT true,
  "noticeText" TEXT DEFAULT '',
  "noticeActive" BOOLEAN DEFAULT false,
  "demoModeActive" BOOLEAN DEFAULT false,
  "demoCode" TEXT DEFAULT '1234',
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- Insert default admin settings if not exist
INSERT INTO public.admin_settings (id, password, "preventRepeatJoins", "publicLinkActive", "noticeText", "noticeActive", "demoModeActive", "demoCode")
VALUES ('settings', '4012', true, true, '', false, false, '1234')
ON CONFLICT (id) DO NOTHING;

-- 8. Leaderboard Table
CREATE TABLE IF NOT EXISTS public.leaderboard (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'leader',
  "totalConverts" INTEGER DEFAULT 0,
  "todayConverts" INTEGER DEFAULT 0,
  designation TEXT,
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) and grant full access for anon and authenticated roles
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on meetings" ON public.meetings;
CREATE POLICY "Allow anon all on meetings" ON public.meetings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on participants" ON public.participants;
CREATE POLICY "Allow anon all on participants" ON public.participants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.demo_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on demo_participants" ON public.demo_participants;
CREATE POLICY "Allow anon all on demo_participants" ON public.demo_participants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on blocked_ips" ON public.blocked_ips;
CREATE POLICY "Allow anon all on blocked_ips" ON public.blocked_ips FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.blocked_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on blocked_devices" ON public.blocked_devices;
CREATE POLICY "Allow anon all on blocked_devices" ON public.blocked_devices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.blocked_uids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on blocked_uids" ON public.blocked_uids;
CREATE POLICY "Allow anon all on blocked_uids" ON public.blocked_uids FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on admin_settings" ON public.admin_settings;
CREATE POLICY "Allow anon all on admin_settings" ON public.admin_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on leaderboard" ON public.leaderboard;
CREATE POLICY "Allow anon all on leaderboard" ON public.leaderboard FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Enable Realtime publication for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.demo_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_ips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_uids;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard;
`;
