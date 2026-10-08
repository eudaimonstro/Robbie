import type { Member } from '@robbie-bylawyer/shared/types';

interface RoomMember extends Member {
  socketId: string;
}

/**
 * How long a member stays present after their last connection drops: a locked phone or a
 * moment without signal costs nothing, and a member who comes back during a vote can vote
 */
export const PRESENCE_GRACE_MS = 90_000;

/**
 * Simple in-memory room manager for tracking connected members, and the grace period each
 * disconnected member has before they are marked absent
 * In a multi-server setup, you would use Redis or similar
 */
class RoomManager {
  private rooms: Map<string, Map<string, RoomMember>> = new Map();
  private graceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  addMember(meetingCode: string, socketId: string, member: Member): void {
    if (!this.rooms.has(meetingCode)) {
      this.rooms.set(meetingCode, new Map());
    }

    const room = this.rooms.get(meetingCode)!;
    room.set(socketId, { ...member, socketId });
    // Back within the grace period: nothing changes
    this.cancelGrace(meetingCode, member.id);
  }

  removeMember(meetingCode: string, socketId: string): void {
    const room = this.rooms.get(meetingCode);
    if (room) {
      room.delete(socketId);
      if (room.size === 0) {
        this.rooms.delete(meetingCode);
      }
    }
  }

  getMembers(meetingCode: string): Member[] {
    const room = this.rooms.get(meetingCode);
    if (!room) return [];

    // Deduplicate by member ID (same user might have multiple connections)
    const memberMap = new Map<number, Member>();
    for (const roomMember of room.values()) {
      const { socketId: _, ...member } = roomMember;
      memberMap.set(member.id, member);
    }

    return Array.from(memberMap.values());
  }

  getMemberCount(meetingCode: string): number {
    return this.getMembers(meetingCode).length;
  }

  isMemberConnected(meetingCode: string, memberId: number): boolean {
    const room = this.rooms.get(meetingCode);
    if (!room) return false;

    for (const member of room.values()) {
      if (member.id === memberId) return true;
    }
    return false;
  }

  updateMemberRole(meetingCode: string, memberId: number, newRole: Member['role']): void {
    const room = this.rooms.get(meetingCode);
    if (!room) return;

    for (const [socketId, member] of room.entries()) {
      if (member.id === memberId) {
        room.set(socketId, { ...member, role: newRole });
      }
    }
  }

  /**
   * Start a disconnected member's grace period: `onExpire` runs after PRESENCE_GRACE_MS unless
   * the member connects again first. One timer per member: starting it again restarts it.
   */
  startGrace(meetingCode: string, memberId: number, onExpire: () => void): void {
    this.cancelGrace(meetingCode, memberId);
    const key = `${meetingCode}:${memberId}`;
    const timer = setTimeout(() => {
      this.graceTimers.delete(key);
      onExpire();
    }, PRESENCE_GRACE_MS);
    // A pending grace period doesn't keep the process alive (at shutdown, say)
    timer.unref?.();
    this.graceTimers.set(key, timer);
  }

  /** Stop a member's grace period; true if one was running */
  cancelGrace(meetingCode: string, memberId: number): boolean {
    const key = `${meetingCode}:${memberId}`;
    const timer = this.graceTimers.get(key);
    if (!timer) return false;
    clearTimeout(timer);
    this.graceTimers.delete(key);
    return true;
  }

  /** Forget a meeting that has ended for good (canceled): its connections and grace periods */
  forgetMeeting(meetingCode: string): void {
    this.rooms.delete(meetingCode);
    const prefix = `${meetingCode}:`;
    for (const [key, timer] of this.graceTimers) {
      if (!key.startsWith(prefix)) continue;
      clearTimeout(timer);
      this.graceTimers.delete(key);
    }
  }

  /** Whether a disconnected member is within their grace period */
  inGrace(meetingCode: string, memberId: number): boolean {
    return this.graceTimers.has(`${meetingCode}:${memberId}`);
  }
}

export const roomManager = new RoomManager();
