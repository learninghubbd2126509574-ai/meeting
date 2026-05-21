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
  userAgent: string;
  joinedAt: Timestamp | any;
  blocked: boolean;
}

export interface BlockedIP {
  ip: string;
  deviceId?: string;
  blockedAt: Timestamp | any;
  name: string;
}

export interface BlockedDevice {
  deviceId: string;
  blockedAt: Timestamp | any;
}

export interface AdminSettings {
  password?: string;
}
