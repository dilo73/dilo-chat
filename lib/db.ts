// ─── Chat database: one interface, two backends ───────────────────────────
// • Real backend: Cloud Firestore (used once Firebase keys are pasted in).
// • Demo backend:  in-memory mock with seed data (used until then, so the
//   whole UI is testable with zero setup). Screens never know the difference.

import {
  collection, doc, setDoc, updateDoc, getDoc, addDoc,
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
}

export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: number;
  status: MessageStatus;
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
  sendMessage(chatId: string, senderId: string, text: string): Promise<void>;
  markChatRead(chatId: string, uid: string): Promise<void>;
  markDelivered(chatId: string, messageId: string): Promise<void>;
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
    };
  }

  private toMessage(chatId: string, id: string, data: any): ChatMessage {
    return {
      id, chatId,
      senderId: data.senderId ?? '',
      text: data.text ?? '',
      createdAt: data.createdAt ?? 0,
      status: (data.status ?? 'sent') as MessageStatus,
    };
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
      (s) => cb(s.docs.map((d) => this.toMessage(chatId, d.id, d.data()))),
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

  async sendMessage(chatId: string, senderId: string, text: string): Promise<void> {
    const chatSnap = await getDoc(doc(this.db, 'chats', chatId));
    const other = (chatSnap.data()?.participants ?? []).find((p: string) => p !== senderId);
    const batch = writeBatch(this.db);
    const msgRef = doc(collection(this.db, 'chats', chatId, 'messages'));
    batch.set(msgRef, { senderId, text, createdAt: Date.now(), status: 'sent' });
    const updates: Record<string, any> = {
      lastMessage: text,
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (other) updates[`unread.${other}`] = increment(1);
    batch.update(doc(this.db, 'chats', chatId), updates);
    await batch.commit();
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
    const list = [...(this.messages.get(chatId) ?? [])].sort((a, b) => a.createdAt - b.createdAt);
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

  async sendMessage(chatId: string, senderId: string, text: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const other = chat.participants.find((p) => p !== senderId);
    const msg: ChatMessage = {
      id: `m_${Date.now()}_${this.seq++}`,
      chatId, senderId, text, createdAt: Date.now(), status: 'sent',
    };
    this.messages.get(chatId)!.push(msg);
    this.chats.set(chatId, {
      ...chat,
      lastMessage: text, lastMessageAt: msg.createdAt, updatedAt: msg.createdAt,
      unread: other ? { ...chat.unread, [other]: (chat.unread[other] ?? 0) + 1 } : chat.unread,
    });
    this.emitMessages(chatId); this.emitChat(chatId);
    this.emitChats(senderId); if (other) this.emitChats(other);
    // Demo auto-reply so single-device testing feels alive.
    if (other && (other === 'demo_923001112233' || other === 'demo_923004445566')) {
      setTimeout(() => this.demoReply(chatId, other), 2500);
    }
  }

  private demoReply(chatId: string, fromUid: string) {
    const chat = this.chats.get(chatId);
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
}

export const chatDb: ChatDb = isConfigured ? new FirestoreDb() : new MockDb();
