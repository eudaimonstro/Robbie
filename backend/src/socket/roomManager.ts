import type { Member } from '@eudaimonstro/robbie-shared/types';

interface RoomMember extends Member {
  socketId: string;
}

/**
 * Simple in-memory room manager for tracking connected members
 * In a multi-server setup, you would use Redis or similar
 */
class RoomManager {
  private rooms: Map<string, Map<string, RoomMember>> = new Map();

  addMember(meetingCode: string, socketId: string, member: Member): void {
    if (!this.rooms.has(meetingCode)) {
      this.rooms.set(meetingCode, new Map());
    }

    const room = this.rooms.get(meetingCode)!;
    room.set(socketId, { ...member, socketId });
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
}

export const roomManager = new RoomManager();
