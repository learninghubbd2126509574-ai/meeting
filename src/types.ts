import { Timestamp } from 'firebase/firestore';

export interface Meeting {
  id: string;
  googleMeetLink: string;
  createdAt: Timestamp | any;
  active: boolean;
  meetingDate?: string;
  meetingTime?: string;
}

export interface Participant {
  id: string;
  name: string;
  meetingId: string;
  ip: string;
  deviceId: string;
  uid?: string;
  browserFingerprint?: string;
  userAgent: string;
  joinedAt: Timestamp | any;
  blocked: boolean;
}

export interface BlockedIP {
  ip: string;
  deviceId?: string;
  uid?: string;
  blockedAt: Timestamp | any;
  name: string;
  reason?: string;
}

export interface BlockedDevice {
  deviceId: string;
  browserFingerprint?: string;
  uid?: string;
  blockedAt: Timestamp | any;
}

export interface AdminSettings {
  password?: string;
  demoModeActive?: boolean;
  demoCode?: string;
}

export interface DemoParticipant {
  id: string;
  name: string;
  gmail: string;
  meetingId: string;
  ip: string;
  deviceId: string;
  uid?: string;
  browserFingerprint?: string;
  userAgent: string;
  joinedAt: any;
  blocked?: boolean;
}

export interface LeaderboardMember {
  id: string;
  name: string;
  role: "leader" | "trainer";
  totalConverts: number;
  todayConverts: number;
  designation?: string;
  badge?: string;
  updatedAt?: any;
}

