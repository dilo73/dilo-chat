// ─── Chat database: one interface, two backends ───────────────────────────
// • Real backend: Cloud Firestore (used once Firebase keys are pasted in).
// • Demo backend:  in-memory mock with seed data (used until then, so the
//   whole UI is testable with zero setup). Screens never know the difference.

import {
  collection, doc, setDoc, updateDoc, getDoc, addDoc, deleteDoc,
  query, where, orderBy, limit, limitToLast, onSnapshot,
  increment, writeBatch, getDocs,
} from 'firebase/firestore';
import { firestoreDb, isConfigured } from './firebase';

export interface UserProfile {
  uid: string;
  phone: string;
  name: string;
  online: boolean;
  lastSeen: number;
  pushToken?: string;
  photoUrl?: string;
  birthday?: string; // YYYY-MM-DD
  blockedUsers?: string[];
  hideLastSeen?: boolean;
  hideOnline?: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  names: Record<string, string>;
  phones: Record<string, string>;
  lastMessage: string;
  lastMessageAt: number;
  updatedAt: number;
  unread: Record<string, number>;
  /** Group chat fields */
  isGroup?: boolean;
  groupName?: string;
  adminIds?: string[];
  /** Organization */
  pinned?: boolean;
  archived?: Record<string, boolean>;
  muted?: Record<string, boolean>;
  folder?: string; // 'work' | 'family' | 'friends' | custom
  /** Wallpaper: color hex or 'default' */
  wallpaper?: string;
  /** Group invite */
  inviteCode?: string;
  /** Disappearing messages: seconds (0 = off) */
  disappearing?: number;
}

export type MessageStatus = 'sent' | 'delivered' | 'read';
export type MessageType =
  | 'text' | 'voice' | 'image' | 'video' | 'document'
  | 'location' | 'contact' | 'poll' | 'sticker';

export interface ReplyRef {
  id: string;
  text: string;
  senderName: string;
}

export interface PollData {
  question: string;
  options: string[];
  votes: Record<string, string[]>; // optionIndex -> uids
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: number;
  status: MessageStatus;
  /** Voice message fields */
  type?: MessageType;
  audioUrl?: string;
  duration?: number; // seconds
  /** Media fields (image/video/document/sticker) */
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  /** Location */
  latitude?: number;
  longitude?: number;
  /** Reply / quote */
  replyTo?: ReplyRef;
  /** Edit */
  edited?: boolean;
  /** Reactions: emoji -> uids */
  reactions?: Record<string, string[]>;
  /** Starred by uids */
  starredBy?: string[];
  /** Disappearing: auto-delete after this timestamp */
  expiresAt?: number;
  /** View-once media */
  viewOnce?: boolean;
  viewedBy?: string[];
  /** Poll */
  poll?: PollData;
  /** Shared contact */
  contactName?: string;
  contactPhone?: string;
  /** Soft delete flags */
  deletedForEveryone?: boolean;
}

export interface ScheduledMessage {
  id: string;
  chatId: string;
  text: string;
  sendAt: number;
  createdAt: number;
}

export interface StatusItem {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: number;
  expiresAt: number;
}

export type Unsubscribe = () => void;

export interface ChatDb {
  readonly isReal: boolean;
  ensureUser(uid: string, phone: string, name: string): Promise<void>;
  setOnline(uid: string, online: boolean): Promise<void>;
  getUser(uid: string): Promise<UserProfile | null>;
  subscribeUsers(cb: (users: UserProfile[]) => void): Unsubscribe;
  subscribeChats(uid: string, cb: (chats: Chat[]) => void): Unsubscribe;
  subscribeChat(chatId: string, cb: (chat: Chat | null) => void): Unsubscribe;
  subscribeMessages(chatId: string, cb: (msgs: ChatMessage[]) => void): Unsubscribe;
  getOrCreateChat(uidA: string, uidB: string): Promise<string>;
  sendMessage(chatId: string, senderId: string, text: string, opts?: SendOpts): Promise<void>;
  sendVoiceMessage(chatId: string, senderId: string, audioUrl: string, duration: number): Promise<void>;
  markChatRead(chatId: string, uid: string): Promise<void>;
  markDelivered(chatId: string, messageId: string): Promise<void>;
  /** Group chat */
  createGroup(name: string, creatorUid: string, memberUids: string[]): Promise<string>;
  addGroupMembers(chatId: string, uids: string[]): Promise<void>;
  removeGroupMember(chatId: string, uid: string): Promise<void>;
  makeGroupAdmin(chatId: string, uid: string): Promise<void>;
  getInviteCode(chatId: string): Promise<string>;
  joinGroupByCode(code: string, uid: string): Promise<string | null>;
  /** Status / stories (24h) */
  postStatus(userId: string, userName: string, text: string): Promise<void>;
  subscribeStatuses(cb: (items: StatusItem[]) => void): Unsubscribe;
  /** ── 40-features pack ── */
  sendMediaMessage(chatId: string, senderId: string, type: 'image' | 'video' | 'document' | 'sticker', mediaUrl: string, opts?: { fileName?: string; fileSize?: number; caption?: string; viewOnce?: boolean }): Promise<void>;
  sendLocationMessage(chatId: string, senderId: string, latitude: number, longitude: number): Promise<void>;
  sendContactMessage(chatId: string, senderId: string, contactName: string, contactPhone: string): Promise<void>;
  sendPollMessage(chatId: string, senderId: string, question: string, options: string[]): Promise<void>;
  votePoll(chatId: string, messageId: string, uid: string, optionIndex: number): Promise<void>;
  editMessage(chatId: string, messageId: string, newText: string): Promise<void>;
  deleteMessage(chatId: string, messageId: string, forEveryone: boolean, uid: string): Promise<void>;
  toggleReaction(chatId: string, messageId: string, uid: string, emoji: string): Promise<void>;
  toggleStar(chatId: string, messageId: string, uid: string): Promise<void>;
  forwardMessage(fromChatId: string, messageId: string, toChatId: string, senderId: string): Promise<void>;
  markViewed(chatId: string, messageId: string, uid: string): Promise<void>;
  setTyping(chatId: string, uid: string, typing: boolean): Promise<void>;
  subscribeTyping(chatId: string, cb: (uids: string[]) => void): Unsubscribe;
  setPinned(chatId: string, pinned: boolean): Promise<void>;
  setArchived(chatId: string, uid: string, archived: boolean): Promise<void>;
  setMuted(chatId: string, uid: string, muted: boolean): Promise<void>;
  setChatFolder(chatId: string, folder: string | null): Promise<void>;
  setWallpaper(chatId: string, wallpaper: string): Promise<void>;
  setDisappearing(chatId: string, seconds: number): Promise<void>;
  blockUser(uid: string, blockedUid: string): Promise<void>;
  unblockUser(uid: string, blockedUid: string): Promise<void>;
  updatePhoto(uid: string, photoUrl: string): Promise<void>;
  updateProfile(uid: string, patch: { name?: string; birthday?: string; hideLastSeen?: boolean; hideOnline?: boolean }): Promise<void>;
  scheduleMessage(chatId: string, senderId: string, text: string, sendAt: number): Promise<void>;
  getDueScheduled(uid: string): Promise<ScheduledMessage[]>;
  deleteScheduled(id: string): Promise<void>;
}

export interface SendOpts {
  replyTo?: ReplyRef;
}

// ─── Real backend: Cloud Firestore ──────────────────────────────────────────

class FirestoreDb implements ChatDb {
  readonly isReal = true;
  private db = firestoreDb!;

  private toUser(uid: string, data: any): UserProfile {
    return {
      uid,
      phone: data.phone ?? '',
      name: data.name ?? 'Unknown',
      online: !!data.online,
      lastSeen: data.lastSeen ?? 0,
      pushToken: data.pushToken ?? undefined,
      photoUrl: data.photoUrl ?? undefined,
      birthday: data.birthday ?? undefined,
      blockedUsers: data.blockedUsers ?? [],
      hideLastSeen: !!data.hideLastSeen,
      hideOnline: !!data.hideOnline,
    };
  }

  private toChat(id: string, data: any): Chat {
    return {
      id,
      participants: data.participants ?? [],
      names: data.names ?? {},
      phones: data.phones ?? {},
      lastMessage: data.lastMessage ?? '',
      lastMessageAt: data.lastMessageAt ?? 0,
      updatedAt: data.updatedAt ?? 0,
      unread: data.unread ?? {},
      isGroup: !!data.isGroup,
      groupName: data.groupName ?? undefined,
      adminIds: data.adminIds ?? undefined,
      pinned: !!data.pinned,
      archived: data.archived ?? {},
      muted: data.muted ?? {},
      folder: data.folder ?? undefined,
      wallpaper: data.wallpaper ?? undefined,
      inviteCode: data.inviteCode ?? undefined,
      disappearing: data.disappearing ?? 0,
    };
  }

  private toMessage(chatId: string, id: string, data: any): ChatMessage {
    return {
      id, chatId,
      senderId: data.senderId ?? '',
      text: data.text ?? '',
      createdAt: data.createdAt ?? 0,
      status: (data.status ?? 'sent') as MessageStatus,
      type: (data.type ?? 'text') as MessageType,
      audioUrl: data.audioUrl ?? undefined,
      duration: data.duration ?? undefined,
      mediaUrl: data.mediaUrl ?? undefined,
      fileName: data.fileName ?? undefined,
      fileSize: data.fileSize ?? undefined,
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
      replyTo: data.replyTo ?? undefined,
      edited: !!data.edited,
      reactions: data.reactions ?? {},
      starredBy: data.starredBy ?? [],
      expiresAt: data.expiresAt ?? undefined,
      viewOnce: !!data.viewOnce,
      viewedBy: data.viewedBy ?? [],
      poll: data.poll ?? undefined,
      contactName: data.contactName ?? undefined,
      contactPhone: data.contactPhone ?? undefined,
      deletedForEveryone: !!data.deletedForEveryone,
    };
  }

  private toStatus(id: string, data: any): StatusItem {
    return {
      id,
      userId: data.userId ?? '',
      userName: data.userName ?? 'Unknown',
      text: data.text ?? '',
      createdAt: data.createdAt ?? 0,
      expiresAt: data.expiresAt ?? 0,
    };
  }

  /** Notify all other participants of a new message via push. */
  private async notifyParticipants(chatId: string, senderId: string, preview: string): Promise<void> {
    try {
      const chatSnap = await getDoc(doc(this.db, 'chats', chatId));
      const data = chatSnap.data();
      if (!data) return;
      const others: string[] = (data.participants ?? []).filter((p: string) => p !== senderId);
      if (others.length === 0) return;
      const senderName: string = data.isGroup
        ? `${data.names?.[senderId] ?? 'Someone'} (${data.groupName ?? 'Group'})`
        : (data.names?.[senderId] ?? 'Dilo Chat');
      const tokens: string[] = [];
      for (const uid of others) {
        const u = await this.getUser(uid);
        if (u?.pushToken) tokens.push(u.pushToken);
      }
      const { sendPush } = await import('./notifications');
      await sendPush(tokens, senderName, preview, { chatId });
    } catch { /* push is best-effort */ }
  }

  async ensureUser(uid: string, phone: string, name: string): Promise<void> {
    await setDoc(doc(this.db, 'users', uid),
      { phone, name, online: true, lastSeen: Date.now() }, { merge: true });
  }

  async setOnline(uid: string, online: boolean): Promise<void> {
    try {
      await setDoc(doc(this.db, 'users', uid),
        { online, lastSeen: Date.now() }, { merge: true });
    } catch { /* offline: ignore */ }
  }

  async getUser(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(this.db, 'users', uid));
    return snap.exists() ? this.toUser(snap.id, snap.data()) : null;
  }

  subscribeUsers(cb: (users: UserProfile[]) => void): Unsubscribe {
    return onSnapshot(collection(this.db, 'users'),
      (s) => cb(s.docs.map((d) => this.toUser(d.id, d.data()))),
      () => cb([]));
  }

  subscribeChats(uid: string, cb: (chats: Chat[]) => void): Unsubscribe {
    // NOTE: sorted client-side so no composite Firestore index is needed.
    const q = query(collection(this.db, 'chats'), where('participants', 'array-contains', uid));
    return onSnapshot(q,
      (s) => {
        const chats = s.docs.map((d) => this.toChat(d.id, d.data()));
        chats.sort((a, b) => b.updatedAt - a.updatedAt);
        cb(chats);
      },
      () => {});
  }

  subscribeChat(chatId: string, cb: (chat: Chat | null) => void): Unsubscribe {
    return onSnapshot(doc(this.db, 'chats', chatId),
      (s) => cb(s.exists() ? this.toChat(s.id, s.data()) : null),
      () => {});
  }

  subscribeMessages(chatId: string, cb: (msgs: ChatMessage[]) => void): Unsubscribe {
    const q = query(
      collection(this.db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limitToLast(100),
    );
    return onSnapshot(q,
      (s) => {
        const now = Date.now();
        cb(s.docs
          .map((d) => this.toMessage(chatId, d.id, d.data()))
          .filter((m) => !m.expiresAt || m.expiresAt > now));
      },
      () => {});
  }

  async getOrCreateChat(uidA: string, uidB: string): Promise<string> {
    const id = [uidA, uidB].sort().join('_');
    const ref = doc(this.db, 'chats', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const [ua, ub] = await Promise.all([this.getUser(uidA), this.getUser(uidB)]);
      await setDoc(ref, {
        participants: [uidA, uidB],
        names: { [uidA]: ua?.name ?? 'Unknown', [uidB]: ub?.name ?? 'Unknown' },
        phones: { [uidA]: ua?.phone ?? '', [uidB]: ub?.phone ?? '' },
        lastMessage: '',
        lastMessageAt: Date.now(),
        updatedAt: Date.now(),
        unread: {},
      });
    }
    return id;
  }

  async sendMessage(chatId: string, senderId: string, text: string, opts?: SendOpts): Promise<void> {
    const chatSnap = await getDoc(doc(this.db, 'chats', chatId));
    const chatData = chatSnap.data();
    const participants: string[] = chatData?.participants ?? [];
    const disappearing: number = chatData?.disappearing ?? 0;
    const batch = writeBatch(this.db);
    const msgRef = doc(collection(this.db, 'chats', chatId, 'messages'));
    const msgData: Record<string, any> = {
      senderId, text, type: 'text', createdAt: Date.now(), status: 'sent',
    };
    if (opts?.replyTo) msgData.replyTo = opts.replyTo;
    if (disappearing > 0) msgData.expiresAt = Date.now() + disappearing * 1000;
    batch.set(msgRef, msgData);
    const updates: Record<string, any> = {
      lastMessage: text,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    };
    participants.forEach((p) => {
      if (p !== senderId) updates[`unread.${p}`] = increment(1);
    });
    batch.update(doc(this.db, 'chats', chatId), updates);
    await batch.commit();
    this.notifyParticipants(chatId, senderId, text);
  }

  async sendVoiceMessage(chatId: string, senderId: string, audioUrl: string, duration: number): Promise<void> {
    const chatSnap = await getDoc(doc(this.db, 'chats', chatId));
    const participants: string[] = chatSnap.data()?.participants ?? [];
    const preview = `🎤 Voice message (${Math.round(duration)}s)`;
    const batch = writeBatch(this.db);
    const msgRef = doc(collection(this.db, 'chats', chatId, 'messages'));
    batch.set(msgRef, { senderId, text: preview, type: 'voice', audioUrl, duration, createdAt: Date.now(), status: 'sent' });
    const updates: Record<string, any> = {
      lastMessage: preview,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    };
    participants.forEach((p) => {
      if (p !== senderId) updates[`unread.${p}`] = increment(1);
    });
    batch.update(doc(this.db, 'chats', chatId), updates);
    await batch.commit();
    this.notifyParticipants(chatId, senderId, preview);
  }

  async createGroup(name: string, creatorUid: string, memberUids: string[]): Promise<string> {
    const participants = [...new Set([creatorUid, ...memberUids])];
    const names: Record<string, string> = {};
    const phones: Record<string, string> = {};
    await Promise.all(participants.map(async (uid) => {
      const u = await this.getUser(uid);
      names[uid] = u?.name ?? 'Unknown';
      phones[uid] = u?.phone ?? '';
    }));
    const ref = await addDoc(collection(this.db, 'chats'), {
      participants,
      names,
      phones,
      isGroup: true,
      groupName: name.trim() || 'New Group',
      adminIds: [creatorUid],
      lastMessage: 'Group created 🎉',
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
      unread: {},
    });
    return ref.id;
  }

  async postStatus(userId: string, userName: string, text: string): Promise<void> {
    const now = Date.now();
    await addDoc(collection(this.db, 'statuses'), {
      userId,
      userName,
      text: text.trim().slice(0, 300),
      createdAt: now,
      expiresAt: now + 24 * 3600 * 1000,
    });
  }

  subscribeStatuses(cb: (items: StatusItem[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'statuses'), orderBy('createdAt', 'desc'), limit(200));
    return onSnapshot(q,
      (s) => {
        const now = Date.now();
        const items = s.docs
          .map((d) => this.toStatus(d.id, d.data()))
          .filter((it) => it.expiresAt > now);
        cb(items);
      },
      () => cb([]));
  }

  // ─── 40-features pack: Firestore implementations ──────────────────────

  private async bumpChat(chatId: string, senderId: string, preview: string): Promise<void> {
    const chatSnap = await getDoc(doc(this.db, 'chats', chatId));
    const participants: string[] = chatSnap.data()?.participants ?? [];
    const updates: Record<string, any> = {
      lastMessage: preview, lastMessageAt: Date.now(), updatedAt: Date.now(),
    };
    participants.forEach((p) => {
      if (p !== senderId) updates[`unread.${p}`] = increment(1);
    });
    await updateDoc(doc(this.db, 'chats', chatId), updates);
  }

  async sendMediaMessage(chatId: string, senderId: string, type: 'image' | 'video' | 'document' | 'sticker', mediaUrl: string, opts?: { fileName?: string; fileSize?: number; caption?: string; viewOnce?: boolean }): Promise<void> {
    const previews: Record<string, string> = {
      image: '📷 Photo', video: '🎬 Video', document: '📄 Document', sticker: '🎭 Sticker',
    };
    const preview = opts?.caption || previews[type];
    const data: Record<string, any> = {
      senderId, text: preview, type, mediaUrl, createdAt: Date.now(), status: 'sent',
    };
    if (opts?.fileName) data.fileName = opts.fileName;
    if (opts?.fileSize) data.fileSize = opts.fileSize;
    if (opts?.viewOnce) data.viewOnce = true;
    await addDoc(collection(this.db, 'chats', chatId, 'messages'), data);
    await this.bumpChat(chatId, senderId, preview);
    this.notifyParticipants(chatId, senderId, preview);
  }

  async sendLocationMessage(chatId: string, senderId: string, latitude: number, longitude: number): Promise<void> {
    const preview = '📍 Location';
    await addDoc(collection(this.db, 'chats', chatId, 'messages'), {
      senderId, text: preview, type: 'location', latitude, longitude,
      createdAt: Date.now(), status: 'sent',
    });
    await this.bumpChat(chatId, senderId, preview);
    this.notifyParticipants(chatId, senderId, preview);
  }

  async sendContactMessage(chatId: string, senderId: string, contactName: string, contactPhone: string): Promise<void> {
    const preview = `👤 ${contactName}`;
    await addDoc(collection(this.db, 'chats', chatId, 'messages'), {
      senderId, text: preview, type: 'contact', contactName, contactPhone,
      createdAt: Date.now(), status: 'sent',
    });
    await this.bumpChat(chatId, senderId, preview);
    this.notifyParticipants(chatId, senderId, preview);
  }

  async sendPollMessage(chatId: string, senderId: string, question: string, options: string[]): Promise<void> {
    const preview = `📊 ${question}`;
    const votes: Record<string, string[]> = {};
    options.forEach((_, i) => { votes[String(i)] = []; });
    await addDoc(collection(this.db, 'chats', chatId, 'messages'), {
      senderId, text: preview, type: 'poll',
      poll: { question, options, votes },
      createdAt: Date.now(), status: 'sent',
    });
    await this.bumpChat(chatId, senderId, preview);
    this.notifyParticipants(chatId, senderId, preview);
  }

  async votePoll(chatId: string, messageId: string, uid: string, optionIndex: number): Promise<void> {
    const ref = doc(this.db, 'chats', chatId, 'messages', messageId);
    const snap = await getDoc(ref);
    const poll = snap.data()?.poll as PollData | undefined;
    if (!poll) return;
    const votes: Record<string, string[]> = { ...poll.votes };
    Object.keys(votes).forEach((k) => { votes[k] = (votes[k] ?? []).filter((u) => u !== uid); });
    const key = String(optionIndex);
    votes[key] = [...(votes[key] ?? []), uid];
    await updateDoc(ref, { poll: { ...poll, votes } });
  }

  async editMessage(chatId: string, messageId: string, newText: string): Promise<void> {
    await updateDoc(doc(this.db, 'chats', chatId, 'messages', messageId), {
      text: newText, edited: true,
    });
  }

  async deleteMessage(chatId: string, messageId: string, forEveryone: boolean, uid: string): Promise<void> {
    const ref = doc(this.db, 'chats', chatId, 'messages', messageId);
    if (forEveryone) {
      await updateDoc(ref, {
        deletedForEveryone: true, text: '🚫 This message was deleted',
        type: 'text', mediaUrl: null, audioUrl: null,
      });
    } else {
      await updateDoc(ref, { [`deletedFor.${uid}`]: true });
    }
  }

  async toggleReaction(chatId: string, messageId: string, uid: string, emoji: string): Promise<void> {
    const ref = doc(this.db, 'chats', chatId, 'messages', messageId);
    const snap = await getDoc(ref);
    const reactions: Record<string, string[]> = { ...(snap.data()?.reactions ?? {}) };
    const list = reactions[emoji] ?? [];
    reactions[emoji] = list.includes(uid) ? list.filter((u) => u !== uid) : [...list, uid];
    if (reactions[emoji].length === 0) delete reactions[emoji];
    await updateDoc(ref, { reactions });
  }

  async toggleStar(chatId: string, messageId: string, uid: string): Promise<void> {
    const ref = doc(this.db, 'chats', chatId, 'messages', messageId);
    const snap = await getDoc(ref);
    const starredBy: string[] = snap.data()?.starredBy ?? [];
    await updateDoc(ref, {
      starredBy: starredBy.includes(uid) ? starredBy.filter((u) => u !== uid) : [...starredBy, uid],
    });
  }

  async forwardMessage(fromChatId: string, messageId: string, toChatId: string, senderId: string): Promise<void> {
    const snap = await getDoc(doc(this.db, 'chats', fromChatId, 'messages', messageId));
    const d = snap.data();
    if (!d || d.deletedForEveryone) return;
    const copy: Record<string, any> = {
      senderId, text: d.text, type: d.type ?? 'text',
      createdAt: Date.now(), status: 'sent',
    };
    ['mediaUrl', 'fileName', 'fileSize', 'audioUrl', 'duration', 'latitude', 'longitude',
     'contactName', 'contactPhone', 'poll', 'viewOnce'].forEach((k) => {
      if (d[k] !== undefined && d[k] !== null) copy[k] = d[k];
    });
    await addDoc(collection(this.db, 'chats', toChatId, 'messages'), copy);
    await this.bumpChat(toChatId, senderId, `↪️ ${d.text}`.slice(0, 100));
  }

  async markViewed(chatId: string, messageId: string, uid: string): Promise<void> {
    const ref = doc(this.db, 'chats', chatId, 'messages', messageId);
    const snap = await getDoc(ref);
    const viewedBy: string[] = snap.data()?.viewedBy ?? [];
    if (!viewedBy.includes(uid)) {
      await updateDoc(ref, { viewedBy: [...viewedBy, uid] });
    }
  }

  async setTyping(chatId: string, uid: string, typing: boolean): Promise<void> {
    try {
      await setDoc(doc(this.db, 'chats', chatId, 'typing', uid),
        { typing, updatedAt: Date.now() }, { merge: true });
    } catch { /* ignore */ }
  }

  subscribeTyping(chatId: string, cb: (uids: string[]) => void): Unsubscribe {
    const q = query(collection(this.db, 'chats', chatId, 'typing'), where('typing', '==', true));
    return onSnapshot(q,
      (s) => {
        const now = Date.now();
        cb(s.docs.filter((d) => now - (d.data().updatedAt ?? 0) < 8000).map((d) => d.id));
      },
      () => cb([]));
  }

  async setPinned(chatId: string, pinned: boolean): Promise<void> {
    await updateDoc(doc(this.db, 'chats', chatId), { pinned });
  }

  async setArchived(chatId: string, uid: string, archived: boolean): Promise<void> {
    await updateDoc(doc(this.db, 'chats', chatId), { [`archived.${uid}`]: archived });
  }

  async setMuted(chatId: string, uid: string, muted: boolean): Promise<void> {
    await updateDoc(doc(this.db, 'chats', chatId), { [`muted.${uid}`]: muted });
  }

  async setChatFolder(chatId: string, folder: string | null): Promise<void> {
    await updateDoc(doc(this.db, 'chats', chatId), { folder: folder ?? null });
  }

  async setWallpaper(chatId: string, wallpaper: string): Promise<void> {
    await updateDoc(doc(this.db, 'chats', chatId), { wallpaper });
  }

  async setDisappearing(chatId: string, seconds: number): Promise<void> {
    await updateDoc(doc(this.db, 'chats', chatId), { disappearing: seconds });
  }

  async addGroupMembers(chatId: string, uids: string[]): Promise<void> {
    const ref = doc(this.db, 'chats', chatId);
    const snap = await getDoc(ref);
    const data = snap.data();
    if (!data) return;
    const participants: string[] = [...new Set([...(data.participants ?? []), ...uids])];
    const names = { ...(data.names ?? {}) };
    const phones = { ...(data.phones ?? {}) };
    await Promise.all(uids.map(async (uid) => {
      const u = await this.getUser(uid);
      names[uid] = u?.name ?? 'Unknown';
      phones[uid] = u?.phone ?? '';
    }));
    await updateDoc(ref, { participants, names, phones, updatedAt: Date.now() });
  }

  async removeGroupMember(chatId: string, uid: string): Promise<void> {
    const ref = doc(this.db, 'chats', chatId);
    const snap = await getDoc(ref);
    const data = snap.data();
    if (!data) return;
    await updateDoc(ref, {
      participants: (data.participants ?? []).filter((p: string) => p !== uid),
      adminIds: (data.adminIds ?? []).filter((p: string) => p !== uid),
      updatedAt: Date.now(),
    });
  }

  async makeGroupAdmin(chatId: string, uid: string): Promise<void> {
    const ref = doc(this.db, 'chats', chatId);
    const snap = await getDoc(ref);
    const adminIds: string[] = snap.data()?.adminIds ?? [];
    if (!adminIds.includes(uid)) {
      await updateDoc(ref, { adminIds: [...adminIds, uid] });
    }
  }

  async getInviteCode(chatId: string): Promise<string> {
    const ref = doc(this.db, 'chats', chatId);
    const snap = await getDoc(ref);
    let code = snap.data()?.inviteCode as string | undefined;
    if (!code) {
      code = Math.random().toString(36).slice(2, 10).toUpperCase();
      await updateDoc(ref, { inviteCode: code });
    }
    return code;
  }

  async joinGroupByCode(code: string, uid: string): Promise<string | null> {
    const q = query(collection(this.db, 'chats'), where('inviteCode', '==', code.toUpperCase()), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const chatId = snap.docs[0].id;
    await this.addGroupMembers(chatId, [uid]);
    return chatId;
  }

  async blockUser(uid: string, blockedUid: string): Promise<void> {
    const ref = doc(this.db, 'users', uid);
    const snap = await getDoc(ref);
    const blocked: string[] = snap.data()?.blockedUsers ?? [];
    if (!blocked.includes(blockedUid)) {
      await updateDoc(ref, { blockedUsers: [...blocked, blockedUid] });
    }
  }

  async unblockUser(uid: string, blockedUid: string): Promise<void> {
    const ref = doc(this.db, 'users', uid);
    const snap = await getDoc(ref);
    const blocked: string[] = snap.data()?.blockedUsers ?? [];
    await updateDoc(ref, { blockedUsers: blocked.filter((u) => u !== blockedUid) });
  }

  async updatePhoto(uid: string, photoUrl: string): Promise<void> {
    await setDoc(doc(this.db, 'users', uid), { photoUrl }, { merge: true });
  }

  async updateProfile(uid: string, patch: { name?: string; birthday?: string; hideLastSeen?: boolean; hideOnline?: boolean }): Promise<void> {
    await setDoc(doc(this.db, 'users', uid), patch, { merge: true });
  }

  async scheduleMessage(chatId: string, senderId: string, text: string, sendAt: number): Promise<void> {
    await addDoc(collection(this.db, 'scheduled'), {
      chatId, senderId, text, sendAt, createdAt: Date.now(),
    });
  }

  async getDueScheduled(uid: string): Promise<ScheduledMessage[]> {
    const q = query(
      collection(this.db, 'scheduled'),
      where('senderId', '==', uid),
      where('sendAt', '<=', Date.now()),
      limit(20),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScheduledMessage));
  }

  async deleteScheduled(id: string): Promise<void> {
    try {
      await deleteDoc(doc(this.db, 'scheduled', id));
    } catch { /* ignore */ }
  }

  async markChatRead(chatId: string, uid: string): Promise<void> {
    try {
      const batch = writeBatch(this.db);
      batch.update(doc(this.db, 'chats', chatId), { [`unread.${uid}`]: 0 });
      const q = query(
        collection(this.db, 'chats', chatId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(60),
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.senderId !== uid && data.status !== 'read') {
          batch.update(d.ref, { status: 'read' });
        }
      });
      await batch.commit();
    } catch { /* offline: ignore */ }
  }

  async markDelivered(chatId: string, messageId: string): Promise<void> {
    try {
      await updateDoc(doc(this.db, 'chats', chatId, 'messages', messageId), { status: 'delivered' });
    } catch { /* offline or already read: ignore */ }
  }
}

// ─── Demo backend: in-memory mock with seed data ─────────────────────────────

type Cb<T> = (v: T) => void;

class MockDb implements ChatDb {
  readonly isReal = false;
  private users = new Map<string, UserProfile>();
  private chats = new Map<string, Chat>();
  private messages = new Map<string, ChatMessage[]>();
  private userListeners = new Set<Cb<UserProfile[]>>();
  private chatListeners = new Map<string, Set<Cb<Chat[]>>>();       // keyed by uid
  private singleChatListeners = new Map<string, Set<Cb<Chat | null>>>();
  private msgListeners = new Map<string, Set<Cb<ChatMessage[]>>>();
  private seededFor = new Set<string>();
  private seq = 0;

  private emitUsers() {
    const list = [...this.users.values()];
    this.userListeners.forEach((cb) => cb(list));
  }
  private emitChats(uid: string) {
    const list = [...this.chats.values()]
      .filter((c) => c.participants.includes(uid))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    this.chatListeners.get(uid)?.forEach((cb) => cb(list));
  }
  private emitChat(chatId: string) {
    this.singleChatListeners.get(chatId)?.forEach((cb) => cb(this.chats.get(chatId) ?? null));
  }
  private emitMessages(chatId: string) {
    const now = Date.now();
    const list = [...(this.messages.get(chatId) ?? [])]
      .filter((m) => !m.expiresAt || m.expiresAt > now)
      .sort((a, b) => a.createdAt - b.createdAt);
    this.msgListeners.get(chatId)?.forEach((cb) => cb(list));
  }
  private emitAll(uid: string, chatId?: string) {
    this.emitUsers();
    this.emitChats(uid);
    if (chatId) { this.emitChat(chatId); this.emitMessages(chatId); }
  }

  /** Seed a friendly demo contact + welcome chat the first time a demo user logs in. */
  private seedFor(uid: string) {
    if (this.seededFor.has(uid)) return;
    this.seededFor.add(uid);
    const ahmed: UserProfile = {
      uid: 'demo_923001112233', phone: '+92 300 1112233',
      name: 'Ahmed Khan', online: true, lastSeen: Date.now(),
    };
    const sara: UserProfile = {
      uid: 'demo_923004445566', phone: '+92 300 4445566',
      name: 'Sara Ali', online: false, lastSeen: Date.now() - 3600 * 1000,
    };
    this.users.set(ahmed.uid, ahmed);
    this.users.set(sara.uid, sara);
    const chatId = [uid, ahmed.uid].sort().join('_');
    const now = Date.now();
    const msgs: ChatMessage[] = [
      { id: `seed_${this.seq++}`, chatId, senderId: ahmed.uid, text: 'Hey! Welcome to Dilo Chat 🎉', createdAt: now - 5 * 60000, status: 'read' },
      { id: `seed_${this.seq++}`, chatId, senderId: ahmed.uid, text: 'This is a demo chat — try the VIP themes in Settings!', createdAt: now - 2 * 60000, status: 'read' },
    ];
    this.chats.set(chatId, {
      id: chatId,
      participants: [uid, ahmed.uid],
      names: { [uid]: this.users.get(uid)?.name ?? 'You', [ahmed.uid]: ahmed.name },
      phones: { [uid]: this.users.get(uid)?.phone ?? '', [ahmed.uid]: ahmed.phone },
      lastMessage: msgs[msgs.length - 1].text,
      lastMessageAt: msgs[msgs.length - 1].createdAt,
      updatedAt: msgs[msgs.length - 1].createdAt,
      unread: { [uid]: 0 },
    });
    this.messages.set(chatId, msgs);
  }

  async ensureUser(uid: string, phone: string, name: string): Promise<void> {
    const existing = this.users.get(uid);
    this.users.set(uid, {
      uid, phone, name,
      online: true, lastSeen: Date.now(),
      ...(existing ? { online: existing.online } : {}),
    });
    this.seedFor(uid);
    this.emitUsers();
    this.emitChats(uid);
  }

  async setOnline(uid: string, online: boolean): Promise<void> {
    const u = this.users.get(uid);
    if (u) { this.users.set(uid, { ...u, online, lastSeen: Date.now() }); this.emitUsers(); }
  }

  async getUser(uid: string): Promise<UserProfile | null> {
    return this.users.get(uid) ?? null;
  }

  subscribeUsers(cb: Cb<UserProfile[]>): Unsubscribe {
    this.userListeners.add(cb);
    cb([...this.users.values()]);
    return () => { this.userListeners.delete(cb); };
  }

  subscribeChats(uid: string, cb: Cb<Chat[]>): Unsubscribe {
    if (!this.chatListeners.has(uid)) this.chatListeners.set(uid, new Set());
    this.chatListeners.get(uid)!.add(cb);
    this.emitChats(uid);
    return () => { this.chatListeners.get(uid)?.delete(cb); };
  }

  subscribeChat(chatId: string, cb: Cb<Chat | null>): Unsubscribe {
    if (!this.singleChatListeners.has(chatId)) this.singleChatListeners.set(chatId, new Set());
    this.singleChatListeners.get(chatId)!.add(cb);
    cb(this.chats.get(chatId) ?? null);
    return () => { this.singleChatListeners.get(chatId)?.delete(cb); };
  }

  subscribeMessages(chatId: string, cb: Cb<ChatMessage[]>): Unsubscribe {
    if (!this.msgListeners.has(chatId)) this.msgListeners.set(chatId, new Set());
    this.msgListeners.get(chatId)!.add(cb);
    this.emitMessages(chatId);
    return () => { this.msgListeners.get(chatId)?.delete(cb); };
  }

  async getOrCreateChat(uidA: string, uidB: string): Promise<string> {
    const id = [uidA, uidB].sort().join('_');
    if (!this.chats.has(id)) {
      const ua = this.users.get(uidA); const ub = this.users.get(uidB);
      this.chats.set(id, {
        id,
        participants: [uidA, uidB],
        names: { [uidA]: ua?.name ?? 'Unknown', [uidB]: ub?.name ?? 'Unknown' },
        phones: { [uidA]: ua?.phone ?? '', [uidB]: ub?.phone ?? '' },
        lastMessage: '', lastMessageAt: Date.now(), updatedAt: Date.now(), unread: {},
      });
      this.messages.set(id, []);
      this.emitChat(id); this.emitMessages(id);
      this.emitChats(uidA); this.emitChats(uidB);
    }
    return id;
  }

  async sendMessage(chatId: string, senderId: string, text: string, opts?: SendOpts): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const msg: ChatMessage = {
      id: `m_${Date.now()}_${this.seq++}`,
      chatId, senderId, text, type: 'text', createdAt: Date.now(), status: 'sent',
      reactions: {}, starredBy: [], viewedBy: [],
      replyTo: opts?.replyTo,
    };
    if (chat.disappearing && chat.disappearing > 0) {
      msg.expiresAt = Date.now() + chat.disappearing * 1000;
    }
    this.messages.get(chatId)!.push(msg);
    const unread = { ...chat.unread };
    chat.participants.forEach((p) => { if (p !== senderId) unread[p] = (unread[p] ?? 0) + 1; });
    this.chats.set(chatId, {
      ...chat,
      lastMessage: text, lastMessageAt: msg.createdAt, updatedAt: msg.createdAt, unread,
    });
    this.emitMessages(chatId); this.emitChat(chatId);
    chat.participants.forEach((p) => this.emitChats(p));
    // Demo auto-reply so single-device testing feels alive.
    const other = chat.participants.find((p) => p !== senderId);
    if (!chat.isGroup && other && (other === 'demo_923001112233' || other === 'demo_923004445566')) {
      setTimeout(() => this.demoReply(chatId, other), 2500);
    }
  }

  private demoReply(chatId: string, fromUid: string) {    const chat = this.chats.get(chatId);
    if (!chat) return;
    const replies = [
      'Nice! Dilo Chat is working 🔥',
      'Try changing the theme in Settings — VIP vibes ✨',
      'Mujhe tumhara message mil gaya! 👍',
    ];
    const msg: ChatMessage = {
      id: `m_${Date.now()}_${this.seq++}`,
      chatId, senderId: fromUid,
      text: replies[Math.floor(Math.random() * replies.length)],
      createdAt: Date.now(), status: 'sent',
    };
    this.messages.get(chatId)!.push(msg);
    const me = chat.participants.find((p) => p !== fromUid)!;
    this.chats.set(chatId, {
      ...chat, lastMessage: msg.text, lastMessageAt: msg.createdAt, updatedAt: msg.createdAt,
      unread: { ...chat.unread, [me]: (chat.unread[me] ?? 0) + 1 },
    });
    this.emitMessages(chatId); this.emitChat(chatId);
    this.emitChats(fromUid); this.emitChats(me);
  }

  async markChatRead(chatId: string, uid: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    let changed = false;
    (this.messages.get(chatId) ?? []).forEach((m) => {
      if (m.senderId !== uid && m.status !== 'read') { m.status = 'read'; changed = true; }
    });
    if ((chat.unread[uid] ?? 0) !== 0 || changed) {
      this.chats.set(chatId, { ...chat, unread: { ...chat.unread, [uid]: 0 } });
      this.emitMessages(chatId); this.emitChat(chatId);
      this.emitChats(uid);
      chat.participants.forEach((p) => { if (p !== uid) this.emitChats(p); });
    }
  }

  async markDelivered(chatId: string, messageId: string): Promise<void> {
    const msg = (this.messages.get(chatId) ?? []).find((m) => m.id === messageId);
    if (msg && msg.status === 'sent') {
      msg.status = 'delivered';
      this.emitMessages(chatId);
    }
  }

  async sendVoiceMessage(chatId: string, senderId: string, audioUrl: string, duration: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const preview = `🎤 Voice message (${Math.round(duration)}s)`;
    const msg: ChatMessage = {
      id: `m_${Date.now()}_${this.seq++}`,
      chatId, senderId, text: preview, type: 'voice', audioUrl, duration,
      createdAt: Date.now(), status: 'sent',
    };
    this.messages.get(chatId)!.push(msg);
    const unread = { ...chat.unread };
    chat.participants.forEach((p) => { if (p !== senderId) unread[p] = (unread[p] ?? 0) + 1; });
    this.chats.set(chatId, { ...chat, lastMessage: preview, lastMessageAt: msg.createdAt, updatedAt: msg.createdAt, unread });
    this.emitMessages(chatId); this.emitChat(chatId);
    chat.participants.forEach((p) => this.emitChats(p));
  }

  private statusItems: StatusItem[] = [];
  private statusListeners = new Set<Cb<StatusItem[]>>();

  async createGroup(name: string, creatorUid: string, memberUids: string[]): Promise<string> {
    const participants = [...new Set([creatorUid, ...memberUids])];
    const names: Record<string, string> = {};
    const phones: Record<string, string> = {};
    participants.forEach((uid) => {
      const u = this.users.get(uid);
      names[uid] = u?.name ?? 'Unknown';
      phones[uid] = u?.phone ?? '';
    });
    const id = `group_${Date.now()}_${this.seq++}`;
    this.chats.set(id, {
      id, participants, names, phones,
      isGroup: true, groupName: name.trim() || 'New Group', adminIds: [creatorUid],
      lastMessage: 'Group created 🎉', lastMessageAt: Date.now(), updatedAt: Date.now(), unread: {},
    });
    this.messages.set(id, []);
    this.emitChat(id); this.emitMessages(id);
    participants.forEach((p) => this.emitChats(p));
    return id;
  }

  async postStatus(userId: string, userName: string, text: string): Promise<void> {
    const now = Date.now();
    this.statusItems.unshift({
      id: `s_${now}_${this.seq++}`, userId, userName,
      text: text.trim().slice(0, 300), createdAt: now, expiresAt: now + 24 * 3600 * 1000,
    });
    this.emitStatuses();
  }

  private emitStatuses() {
    const now = Date.now();
    const live = this.statusItems.filter((s) => s.expiresAt > now);
    this.statusListeners.forEach((cb) => cb(live));
  }

  subscribeStatuses(cb: Cb<StatusItem[]>): Unsubscribe {
    this.statusListeners.add(cb);
    this.emitStatuses();
    return () => { this.statusListeners.delete(cb); };
  }

  // ─── 40-features pack: Mock implementations ────────────────────────────

  private mockBump(chatId: string, senderId: string, preview: string) {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const unread = { ...chat.unread };
    chat.participants.forEach((p) => { if (p !== senderId) unread[p] = (unread[p] ?? 0) + 1; });
    this.chats.set(chatId, { ...chat, lastMessage: preview, lastMessageAt: Date.now(), updatedAt: Date.now(), unread });
    this.emitChat(chatId);
    chat.participants.forEach((p) => this.emitChats(p));
  }

  private mockAddMessage(chatId: string, senderId: string, data: Partial<ChatMessage>): ChatMessage {
    const chat = this.chats.get(chatId);
    const msg: ChatMessage = {
      id: `m_${Date.now()}_${this.seq++}`,
      chatId, senderId, text: '', createdAt: Date.now(), status: 'sent',
      type: 'text', reactions: {}, starredBy: [], viewedBy: [],
      ...data,
    } as ChatMessage;
    if (chat?.disappearing && chat.disappearing > 0 && !msg.expiresAt) {
      msg.expiresAt = Date.now() + chat.disappearing * 1000;
    }
    this.messages.get(chatId)!.push(msg);
    this.emitMessages(chatId);
    return msg;
  }

  async sendMediaMessage(chatId: string, senderId: string, type: 'image' | 'video' | 'document' | 'sticker', mediaUrl: string, opts?: { fileName?: string; fileSize?: number; caption?: string; viewOnce?: boolean }): Promise<void> {
    const previews: Record<string, string> = { image: '📷 Photo', video: '🎬 Video', document: '📄 Document', sticker: '🎭 Sticker' };
    const preview = opts?.caption || previews[type];
    this.mockAddMessage(chatId, senderId, {
      text: preview, type, mediaUrl,
      fileName: opts?.fileName, fileSize: opts?.fileSize, viewOnce: opts?.viewOnce,
    });
    this.mockBump(chatId, senderId, preview);
  }

  async sendLocationMessage(chatId: string, senderId: string, latitude: number, longitude: number): Promise<void> {
    this.mockAddMessage(chatId, senderId, { text: '📍 Location', type: 'location', latitude, longitude });
    this.mockBump(chatId, senderId, '📍 Location');
  }

  async sendContactMessage(chatId: string, senderId: string, contactName: string, contactPhone: string): Promise<void> {
    this.mockAddMessage(chatId, senderId, { text: `👤 ${contactName}`, type: 'contact', contactName, contactPhone });
    this.mockBump(chatId, senderId, `👤 ${contactName}`);
  }

  async sendPollMessage(chatId: string, senderId: string, question: string, options: string[]): Promise<void> {
    const votes: Record<string, string[]> = {};
    options.forEach((_, i) => { votes[String(i)] = []; });
    this.mockAddMessage(chatId, senderId, { text: `📊 ${question}`, type: 'poll', poll: { question, options, votes } });
    this.mockBump(chatId, senderId, `📊 ${question}`);
  }

  async votePoll(chatId: string, messageId: string, uid: string, optionIndex: number): Promise<void> {
    const msg = (this.messages.get(chatId) ?? []).find((m) => m.id === messageId);
    if (!msg?.poll) return;
    Object.keys(msg.poll.votes).forEach((k) => { msg.poll!.votes[k] = msg.poll!.votes[k].filter((u) => u !== uid); });
    const key = String(optionIndex);
    msg.poll.votes[key] = [...(msg.poll.votes[key] ?? []), uid];
    this.emitMessages(chatId);
  }

  async editMessage(chatId: string, messageId: string, newText: string): Promise<void> {
    const msg = (this.messages.get(chatId) ?? []).find((m) => m.id === messageId);
    if (msg) { msg.text = newText; msg.edited = true; this.emitMessages(chatId); }
  }

  async deleteMessage(chatId: string, messageId: string, forEveryone: boolean, uid: string): Promise<void> {
    const msgs = this.messages.get(chatId) ?? [];
    const msg = msgs.find((m) => m.id === messageId);
    if (!msg) return;
    if (forEveryone) {
      msg.deletedForEveryone = true;
      msg.text = '🚫 This message was deleted';
      msg.type = 'text';
      msg.mediaUrl = undefined;
      msg.audioUrl = undefined;
    } else {
      this.messages.set(chatId, msgs.filter((m) => m.id !== messageId || m.senderId !== uid || false));
      // for-me delete: just remove from local list for simplicity in mock
      const idx = msgs.indexOf(msg);
      if (idx >= 0) msgs.splice(idx, 1);
    }
    this.emitMessages(chatId);
  }

  async toggleReaction(chatId: string, messageId: string, uid: string, emoji: string): Promise<void> {
    const msg = (this.messages.get(chatId) ?? []).find((m) => m.id === messageId);
    if (!msg) return;
    msg.reactions = msg.reactions ?? {};
    const list = msg.reactions[emoji] ?? [];
    msg.reactions[emoji] = list.includes(uid) ? list.filter((u) => u !== uid) : [...list, uid];
    if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    this.emitMessages(chatId);
  }

  async toggleStar(chatId: string, messageId: string, uid: string): Promise<void> {
    const msg = (this.messages.get(chatId) ?? []).find((m) => m.id === messageId);
    if (!msg) return;
    msg.starredBy = msg.starredBy ?? [];
    msg.starredBy = msg.starredBy.includes(uid)
      ? msg.starredBy.filter((u) => u !== uid)
      : [...msg.starredBy, uid];
    this.emitMessages(chatId);
  }

  async forwardMessage(fromChatId: string, messageId: string, toChatId: string, senderId: string): Promise<void> {
    const msg = (this.messages.get(fromChatId) ?? []).find((m) => m.id === messageId);
    if (!msg || msg.deletedForEveryone) return;
    const { id, chatId, createdAt, status, reactions, starredBy, viewedBy, replyTo, edited, expiresAt, ...rest } = msg;
    this.mockAddMessage(toChatId, senderId, { ...rest, text: msg.text });
    this.mockBump(toChatId, senderId, `↪️ ${msg.text}`.slice(0, 100));
  }

  async markViewed(chatId: string, messageId: string, uid: string): Promise<void> {
    const msg = (this.messages.get(chatId) ?? []).find((m) => m.id === messageId);
    if (!msg) return;
    msg.viewedBy = msg.viewedBy ?? [];
    if (!msg.viewedBy.includes(uid)) { msg.viewedBy.push(uid); this.emitMessages(chatId); }
  }

  private typingMap = new Map<string, Set<string>>();
  private typingListeners = new Map<string, Set<Cb<string[]>>>();

  async setTyping(chatId: string, uid: string, typing: boolean): Promise<void> {
    if (!this.typingMap.has(chatId)) this.typingMap.set(chatId, new Set());
    const set = this.typingMap.get(chatId)!;
    if (typing) set.add(uid); else set.delete(uid);
    this.typingListeners.get(chatId)?.forEach((cb) => cb([...set]));
  }

  subscribeTyping(chatId: string, cb: Cb<string[]>): Unsubscribe {
    if (!this.typingListeners.has(chatId)) this.typingListeners.set(chatId, new Set());
    this.typingListeners.get(chatId)!.add(cb);
    cb([...(this.typingMap.get(chatId) ?? [])]);
    return () => { this.typingListeners.get(chatId)?.delete(cb); };
  }

  async setPinned(chatId: string, pinned: boolean): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) { this.chats.set(chatId, { ...chat, pinned }); chat.participants.forEach((p) => this.emitChats(p)); }
  }

  async setArchived(chatId: string, uid: string, archived: boolean): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      this.chats.set(chatId, { ...chat, archived: { ...(chat.archived ?? {}), [uid]: archived } });
      this.emitChats(uid);
    }
  }

  async setMuted(chatId: string, uid: string, muted: boolean): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      this.chats.set(chatId, { ...chat, muted: { ...(chat.muted ?? {}), [uid]: muted } });
      this.emitChats(uid);
    }
  }

  async setChatFolder(chatId: string, folder: string | null): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) { this.chats.set(chatId, { ...chat, folder: folder ?? undefined }); chat.participants.forEach((p) => this.emitChats(p)); }
  }

  async setWallpaper(chatId: string, wallpaper: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) { this.chats.set(chatId, { ...chat, wallpaper }); this.emitChat(chatId); }
  }

  async setDisappearing(chatId: string, seconds: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) { this.chats.set(chatId, { ...chat, disappearing: seconds }); this.emitChat(chatId); }
  }

  async addGroupMembers(chatId: string, uids: string[]): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const participants = [...new Set([...chat.participants, ...uids])];
    const names = { ...chat.names };
    const phones = { ...chat.phones };
    uids.forEach((uid) => {
      const u = this.users.get(uid);
      names[uid] = u?.name ?? 'Unknown';
      phones[uid] = u?.phone ?? '';
    });
    this.chats.set(chatId, { ...chat, participants, names, phones, updatedAt: Date.now() });
    this.emitChat(chatId);
    participants.forEach((p) => this.emitChats(p));
  }

  async removeGroupMember(chatId: string, uid: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    this.chats.set(chatId, {
      ...chat,
      participants: chat.participants.filter((p) => p !== uid),
      adminIds: (chat.adminIds ?? []).filter((p) => p !== uid),
      updatedAt: Date.now(),
    });
    this.emitChat(chatId);
    this.emitChats(uid);
  }

  async makeGroupAdmin(chatId: string, uid: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const adminIds = chat.adminIds ?? [];
    if (!adminIds.includes(uid)) {
      this.chats.set(chatId, { ...chat, adminIds: [...adminIds, uid] });
      this.emitChat(chatId);
    }
  }

  async getInviteCode(chatId: string): Promise<string> {
    const chat = this.chats.get(chatId);
    if (!chat) return '';
    if (!chat.inviteCode) {
      const code = Math.random().toString(36).slice(2, 10).toUpperCase();
      this.chats.set(chatId, { ...chat, inviteCode: code });
    }
    return this.chats.get(chatId)!.inviteCode!;
  }

  async joinGroupByCode(code: string, uid: string): Promise<string | null> {
    for (const [id, chat] of this.chats) {
      if (chat.inviteCode === code.toUpperCase() && chat.isGroup) {
        await this.addGroupMembers(id, [uid]);
        return id;
      }
    }
    return null;
  }

  async blockUser(uid: string, blockedUid: string): Promise<void> {
    const u = this.users.get(uid);
    if (u) {
      const blocked = u.blockedUsers ?? [];
      if (!blocked.includes(blockedUid)) {
        this.users.set(uid, { ...u, blockedUsers: [...blocked, blockedUid] });
        this.emitUsers();
      }
    }
  }

  async unblockUser(uid: string, blockedUid: string): Promise<void> {
    const u = this.users.get(uid);
    if (u) {
      this.users.set(uid, { ...u, blockedUsers: (u.blockedUsers ?? []).filter((x) => x !== blockedUid) });
      this.emitUsers();
    }
  }

  async updatePhoto(uid: string, photoUrl: string): Promise<void> {
    const u = this.users.get(uid);
    if (u) { this.users.set(uid, { ...u, photoUrl }); this.emitUsers(); }
  }

  async updateProfile(uid: string, patch: { name?: string; birthday?: string; hideLastSeen?: boolean; hideOnline?: boolean }): Promise<void> {
    const u = this.users.get(uid);
    if (u) { this.users.set(uid, { ...u, ...patch }); this.emitUsers(); }
  }

  private scheduled: ScheduledMessage[] = [];

  async scheduleMessage(chatId: string, senderId: string, text: string, sendAt: number): Promise<void> {
    this.scheduled.push({ id: `sch_${Date.now()}_${this.seq++}`, chatId, text, sendAt, createdAt: Date.now() });
  }

  async getDueScheduled(uid: string): Promise<ScheduledMessage[]> {
    const now = Date.now();
    const due = this.scheduled.filter((s) => s.sendAt <= now);
    this.scheduled = this.scheduled.filter((s) => s.sendAt > now);
    return due;
  }

  async deleteScheduled(id: string): Promise<void> {
    this.scheduled = this.scheduled.filter((s) => s.id !== id);
  }
}

export const chatDb: ChatDb = isConfigured ? new FirestoreDb() : new MockDb();
