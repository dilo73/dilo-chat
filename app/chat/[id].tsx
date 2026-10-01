// ─── Conversation screen ───────────────────────────────────────────────────
// Real-time messages, ticks, online status, offline queueing, voice messages,
// media (photo/video/document/location/contact), polls, stickers, replies,
// edit/delete/forward/star, reactions, translate, view-once, typing indicator,
// scheduled messages, wallpaper, disappearing-messages indicator.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal,
  ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { chatDb, Chat, ChatMessage, UserProfile, ReplyRef } from '../../lib/db';
import { enqueueMessage, getQueued, QueuedMessage } from '../../lib/queue';
import { useEffectiveOffline } from '../../lib/net';
import { presenceLabel } from '../../lib/format';
import { MessageBubble, DisplayStatus } from '../../components/MessageBubble';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Avatar } from '../../components/Avatar';
import { startRecording, uploadVoice, Recording } from '../../lib/voice';
import {
  pickImage, pickVideo, takePhoto, pickDocument,
  getCurrentLocation, uploadMedia, translateText, PickedMedia,
} from '../../lib/media';

type DisplayMsg = Omit<ChatMessage, 'status'> & { status: ChatMessage['status'] | 'queued' };

const STICKERS = ['😂', '❤️', '👍', '🎉', '🔥', '💯', '😮', '👏'];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { theme, font, singleTick } = useSettings();
  const effectiveOffline = useEffectiveOffline();
  const c = theme.colors;

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [queued, setQueued] = useState<QueuedMessage[]>([]);
  const [text, setText] = useState('');
  const [other, setOther] = useState<UserProfile | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const listRef = useRef<FlatList>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Attach menu / media preview ──
  const [attachOpen, setAttachOpen] = useState(false);
  const [preview, setPreview] = useState<{ picked: PickedMedia; kind: 'image' | 'video' } | null>(null);
  const [previewCaption, setPreviewCaption] = useState('');
  const [previewViewOnce, setPreviewViewOnce] = useState(false);

  // ── Reply / edit ──
  const [replyTo, setReplyTo] = useState<{ msg: DisplayMsg; senderName: string } | null>(null);
  const [editing, setEditing] = useState<DisplayMsg | null>(null);

  // ── Forward ──
  const [forwardMsg, setForwardMsg] = useState<DisplayMsg | null>(null);
  const [forwardChats, setForwardChats] = useState<Chat[]>([]);

  // ── View-once viewer ──
  const [viewOnceMsg, setViewOnceMsg] = useState<DisplayMsg | null>(null);

  // ── Typing indicator ──
  const [typingUids, setTypingUids] = useState<string[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Poll modal ──
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState<string[]>(['', '']);

  // ── Schedule modal ──
  const [schedOpen, setSchedOpen] = useState(false);

  // ── Contact modal ──
  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const isGroup = !!chat?.isGroup;
  const otherUid = !isGroup ? chat?.participants.find((p) => p !== user?.uid) : undefined;
  const otherName = otherUid ? chat?.names[otherUid] ?? 'Unknown' : 'Unknown';
  const headerTitle = isGroup ? (chat?.groupName ?? 'Group') : otherName;

  const typingNames = useMemo(() => {
    if (!chat) return [];
    return typingUids
      .filter((u) => u !== user?.uid)
      .map((u) => chat.names[u] ?? 'Someone');
  }, [typingUids, chat, user?.uid]);

  const headerSubtitle = useMemo(() => {
    if (typingNames.length > 0) {
      return typingNames.length === 1
        ? `${typingNames[0]} is typing...`
        : `${typingNames.slice(0, 2).join(', ')}${typingNames.length > 2 ? ` +${typingNames.length - 2}` : ''} are typing...`;
    }
    if (isGroup) return `${chat?.participants.length ?? 0} members`;
    return other ? presenceLabel(other.online, other.lastSeen) : ' ';
  }, [typingNames, isGroup, chat, other]);

  useEffect(() => {
    if (!id) return;
    return chatDb.subscribeChat(id, setChat);
  }, [id]);

  // Messages: pause listener while offline (Firestore cache still serves reads
  // on real backend; mock keeps last state).
  useEffect(() => {
    if (!id || !user || effectiveOffline) return;
    return chatDb.subscribeMessages(id, (msgs) => {
      setMessages(msgs);
      msgs.forEach((m) => {
        if (m.senderId !== user.uid && m.status === 'sent') {
          chatDb.markDelivered(id, m.id);
        }
      });
      chatDb.markChatRead(id, user.uid);
    });
  }, [id, user?.uid, effectiveOffline]);

  // Other person's presence
  useEffect(() => {
    if (!otherUid || effectiveOffline) return;
    return chatDb.subscribeUsers((all) => {
      setOther(all.find((u) => u.uid === otherUid) ?? null);
    });
  }, [otherUid, effectiveOffline]);

  // Typing indicator subscription
  useEffect(() => {
    if (!id || effectiveOffline) return;
    return chatDb.subscribeTyping(id, setTypingUids);
  }, [id, effectiveOffline]);

  // Refresh queued messages + flush due scheduled messages whenever focused
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        if (id) {
          const q = await getQueued(id);
          if (active) setQueued(q);
        }
        if (user && !effectiveOffline) {
          try {
            const due = await chatDb.getDueScheduled(user.uid);
            for (const s of due) {
              if (!active) break;
              try {
                await chatDb.sendMessage(s.chatId, user.uid, s.text);
                await chatDb.deleteScheduled(s.id);
              } catch { /* retry next focus */ }
            }
          } catch { /* ignore */ }
        }
      })();
      return () => { active = false; };
    }, [id, user?.uid, effectiveOffline]),
  );

  const displayMessages: DisplayMsg[] = useMemo(() => {
    const q: DisplayMsg[] = queued.map((m) => ({
      id: `q_${m.tempId}`, chatId: m.chatId, senderId: user?.uid ?? '',
      text: m.text, createdAt: m.createdAt, status: 'queued' as const,
    }));
    const all = [...messages, ...q].sort((a, b) => b.createdAt - a.createdAt);
    return all;
  }, [messages, queued, user?.uid]);

  // ── Typing: debounce setTyping ──
  const onTextChange = (t: string) => {
    setText(t);
    if (!id || !user || effectiveOffline) return;
    chatDb.setTyping(id, user.uid, true).catch(() => {});
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      if (id && user) chatDb.setTyping(id, user.uid, false).catch(() => {});
    }, 3000);
  };

  const stopTyping = () => {
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
    if (id && user) chatDb.setTyping(id, user.uid, false).catch(() => {});
  };

  // ── Send (text / reply / edit) ──
  const send = async () => {
    const t = text.trim();
    if (!t || !user || !id) return;
    setText('');
    stopTyping();
    if (editing) {
      const m = editing;
      setEditing(null);
      try { await chatDb.editMessage(id, m.id, t); }
      catch { Alert.alert('Error', 'Edit fail ho gaya.'); }
      return;
    }
    const replyRef: ReplyRef | undefined = replyTo
      ? { id: replyTo.msg.id, text: replyTo.msg.text.slice(0, 120), senderName: replyTo.senderName }
      : undefined;
    setReplyTo(null);
    if (effectiveOffline) {
      const item = await enqueueMessage(id, t);
      setQueued((q) => [...q, item]);
    } else {
      try {
        await chatDb.sendMessage(id, user.uid, t, replyRef ? { replyTo: replyRef } : undefined);
      } catch {
        // Send failed (probably offline) → queue it instead.
        const item = await enqueueMessage(id, t);
        setQueued((q) => [...q, item]);
      }
    }
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
  };

  // ── Media ──
  const sendPicked = async (picked: PickedMedia | null, kind: 'image' | 'video' | 'document') => {
    if (!picked || !user || !id) return;
    setSendingMedia(true);
    try {
      const url = await uploadMedia('chat_media', picked.uri, picked.fileName ?? `${kind}_${Date.now()}`);
      if (!url) { Alert.alert('Error', 'Upload fail ho gaya.'); return; }
      await chatDb.sendMediaMessage(id, user.uid, kind === 'document' ? 'document' : kind, url, {
        fileName: picked.fileName,
        fileSize: picked.fileSize,
        caption: previewCaption.trim() || undefined,
        viewOnce: kind === 'image' ? previewViewOnce : false,
      });
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    } catch {
      Alert.alert('Error', 'Media send nahi ho saka.');
    } finally {
      setSendingMedia(false);
      setPreview(null);
      setPreviewCaption('');
      setPreviewViewOnce(false);
    }
  };

  const handleAttach = async (action: string) => {
    setAttachOpen(false);
    if (!user || !id || effectiveOffline) {
      if (effectiveOffline) Alert.alert('Offline', 'Pehle internet on karo.');
      return;
    }
    try {
      switch (action) {
        case 'photo': {
          const p = await pickImage();
          if (p) { setPreview({ picked: p, kind: 'image' }); setPreviewCaption(''); setPreviewViewOnce(false); }
          break;
        }
        case 'video': {
          const p = await pickVideo();
          if (p) { setPreview({ picked: p, kind: 'video' }); setPreviewCaption(''); setPreviewViewOnce(false); }
          break;
        }
        case 'camera': {
          const p = await takePhoto();
          if (p) { setPreview({ picked: p, kind: 'image' }); setPreviewCaption(''); setPreviewViewOnce(false); }
          break;
        }
        case 'document': {
          const p = await pickDocument();
          if (p) await sendPicked(p, 'document');
          break;
        }
        case 'location': {
          const loc = await getCurrentLocation();
          if (!loc) { Alert.alert('Location', 'Location permission chahiye.'); break; }
          await chatDb.sendLocationMessage(id, user.uid, loc.latitude, loc.longitude);
          break;
        }
        case 'contact':
          setContactOpen(true);
          break;
        case 'poll':
          setPollOpen(true);
          break;
        default:
          break;
      }
    } catch {
      Alert.alert('Error', 'Kuch ghalat ho gaya.');
    }
  };

  const sendContact = async () => {
    if (!contactName.trim() || !contactPhone.trim() || !user || !id) {
      Alert.alert('Contact', 'Naam aur number dono likho.');
      return;
    }
    try {
      await chatDb.sendContactMessage(id, user.uid, contactName.trim(), contactPhone.trim());
      setContactOpen(false);
      setContactName('');
      setContactPhone('');
    } catch {
      Alert.alert('Error', 'Contact send nahi ho saka.');
    }
  };

  const sendSticker = async (emoji: string) => {
    if (!user || !id) return;
    setAttachOpen(false);
    try {
      await chatDb.sendMediaMessage(id, user.uid, 'sticker', emoji);
    } catch {
      Alert.alert('Error', 'Sticker send nahi ho saka.');
    }
  };

  // ── Poll ──
  const sendPoll = async () => {
    const q = pollQ.trim();
    const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2 || !user || !id) {
      Alert.alert('Poll', 'Sawal aur kam az kam 2 options likho.');
      return;
    }
    try {
      await chatDb.sendPollMessage(id, user.uid, q, opts);
      setPollOpen(false);
      setPollQ('');
      setPollOpts(['', '']);
    } catch {
      Alert.alert('Error', 'Poll send nahi ho saka.');
    }
  };

  // ── Schedule ──
  const schedule = async (sendAt: number, label: string) => {
    const t = text.trim();
    if (!t || !user || !id) {
      Alert.alert('Schedule', 'Pehle message likho, phir schedule karo.');
      return;
    }
    try {
      await chatDb.scheduleMessage(id, user.uid, t, sendAt);
      setText('');
      setSchedOpen(false);
      Alert.alert('Scheduled ✅', `Message ${label} bheja jayega.`);
    } catch {
      Alert.alert('Error', 'Schedule nahi ho saka.');
    }
  };

  // ── Message actions (wired to MessageBubble) ──
  const msgSenderName = (m: DisplayMsg) =>
    m.senderId === user?.uid ? 'You' : (chat?.names[m.senderId] ?? 'Unknown');

  const handleReaction = async (m: DisplayMsg, emoji: string) => {
    if (!id || !user) return;
    try { await chatDb.toggleReaction(id, m.id, user.uid, emoji); } catch { /* ignore */ }
  };

  const handleReply = (m: DisplayMsg) => {
    setEditing(null);
    setReplyTo({ msg: m, senderName: msgSenderName(m) });
  };

  const handleEdit = (m: DisplayMsg) => {
    setReplyTo(null);
    setEditing(m);
    setText(m.text);
  };

  const handleDelete = (m: DisplayMsg) => {
    if (!id || !user) return;
    const isMine = m.senderId === user.uid;
    if (!isMine) {
      // Not mine → only delete for me.
      chatDb.deleteMessage(id, m.id, false, user.uid).catch(() => {});
      return;
    }
    Alert.alert('Delete message', 'Kaise delete karna hai?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete for me',
        onPress: () => chatDb.deleteMessage(id, m.id, false, user.uid).catch(() => {}),
      },
      {
        text: 'Delete for everyone',
        style: 'destructive',
        onPress: () => chatDb.deleteMessage(id, m.id, true, user.uid).catch(() => {}),
      },
    ]);
  };

  const handleForward = (m: DisplayMsg) => {
    if (!user) return;
    setForwardMsg(m);
    const unsub = chatDb.subscribeChats(user.uid, (chats) => {
      setForwardChats(chats.filter((ch) => ch.id !== id));
    });
    // Keep the subscription while the modal is open; cleaned on close.
    (handleForward as any)._unsub = unsub;
  };

  const closeForward = () => {
    setForwardMsg(null);
    const unsub = (handleForward as any)._unsub;
    if (unsub) { unsub(); (handleForward as any)._unsub = null; }
  };

  const doForward = async (toChatId: string) => {
    if (!forwardMsg || !user || !id) return;
    try {
      await chatDb.forwardMessage(id, forwardMsg.id, toChatId, user.uid);
      closeForward();
      router.push(`/chat/${toChatId}`);
    } catch {
      Alert.alert('Error', 'Forward nahi ho saka.');
    }
  };

  const handleStar = (m: DisplayMsg) => {
    if (!id || !user) return;
    chatDb.toggleStar(id, m.id, user.uid).catch(() => {});
  };

  const looksUrdu = (t: string) => /[\u0600-\u06FF]/.test(t);

  const handleTranslate = async (m: DisplayMsg) => {
    const target = looksUrdu(m.text) ? 'en' : 'ur';
    try {
      const out = await translateText(m.text, target);
      Alert.alert(
        target === 'en' ? 'Translation (English)' : 'Tarjuma (Urdu)',
        out ?? 'Translate nahi ho saka.',
      );
    } catch {
      Alert.alert('Error', 'Translate nahi ho saka.');
    }
  };

  const handleViewOnce = (m: DisplayMsg) => {
    if (!m.viewOnce) return;
    const alreadyViewed = (m.viewedBy ?? []).includes(user?.uid ?? '');
    if (alreadyViewed && m.senderId !== user?.uid) return;
    setViewOnceMsg(m);
  };

  const closeViewOnce = () => {
    if (viewOnceMsg && id && user && viewOnceMsg.senderId !== user.uid) {
      chatDb.markViewed(id, viewOnceMsg.id, user.uid).catch(() => {});
    }
    setViewOnceMsg(null);
  };

  const renderItem = ({ item }: { item: DisplayMsg }) => {
    const isMine = item.senderId === user?.uid;
    // Queued (offline) messages don't support actions yet.
    const isQueued = item.id.startsWith('q_');
    return (
      <MessageBubble
        message={item}
        isMine={isMine}
        theme={theme}
        font={font}
        singleTick={singleTick}
        statusOverride={item.status as DisplayStatus}
        senderName={isGroup && !isMine ? chat?.names[item.senderId] : undefined}
        currentUid={user?.uid}
        onReaction={isQueued ? undefined : (emoji) => handleReaction(item, emoji)}
        onReply={isQueued ? undefined : () => handleReply(item)}
        onEdit={isQueued || !isMine ? undefined : () => handleEdit(item)}
        onDelete={isQueued ? undefined : () => handleDelete(item)}
        onForward={isQueued ? undefined : () => handleForward(item)}
        onStar={isQueued ? undefined : () => handleStar(item)}
        onTranslate={isQueued ? undefined : () => handleTranslate(item)}
        onViewOnce={isQueued ? undefined : () => handleViewOnce(item)}
      />
    );
  };

  // ── Voice recording ──────────────────────────────────────────────────
  const startVoice = async () => {
    if (recording || effectiveOffline) return;
    const rec = await startRecording();
    if (!rec) {
      Alert.alert('Microphone', 'Microphone permission chahiye voice message ke liye.');
      return;
    }
    setRecording(rec);
    setRecSecs(0);
    recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
  };

  const stopVoice = async (sendIt: boolean) => {
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    const rec = recording;
    setRecording(null);
    setRecSecs(0);
    if (!rec) return;
    if (!sendIt) { await rec.cancel(); return; }
    const result = await rec.stop();
    if (!result || !user || !id) return;
    setSendingVoice(true);
    try {
      const url = await uploadVoice(id, result.uri);
      if (url) await chatDb.sendVoiceMessage(id, user.uid, url, result.duration);
      else Alert.alert('Error', 'Voice upload fail ho gaya. Dobara try karo.');
    } finally {
      setSendingVoice(false);
    }
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
  };

  useEffect(() => () => {
    if (recTimer.current) clearInterval(recTimer.current);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    recording?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bgStyle = chat?.wallpaper
    ? { backgroundColor: chat.wallpaper }
    : { backgroundColor: c.chatBg };

  return (
    <SafeAreaView style={[styles.container, bgStyle]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}

      {/* Header (tap → chat info) */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerMain}
          activeOpacity={0.7}
          onPress={() => id && router.push(`/chat/info?id=${id}`)}
        >
          <Avatar name={headerTitle} size={40} colors={c} />
          <View style={styles.headerText}>
            <View style={styles.headerNameRow}>
              <Text style={[styles.headerName, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                {headerTitle}
              </Text>
              {(chat?.disappearing ?? 0) > 0 && (
                <Ionicons name="timer-outline" size={15} color={c.textDim} style={{ marginLeft: 5 }} />
              )}
            </View>
            <Text
              style={[styles.headerStatus, { color: typingNames.length > 0 ? c.accent : (!isGroup && other?.online ? c.accent : c.textDim) }]}
              numberOfLines={1}
            >
              {headerSubtitle}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="videocam-outline" size={23} color={c.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="call-outline" size={21} color={c.text} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyCard, { backgroundColor: c.surface }]}>
                <Text style={[styles.emptyText, { color: c.textDim, fontFamily: font.family }]}>
                  Say salaam! 👋{'\n'}Messages are end-to-end yours — no WhatsApp involved.
                </Text>
              </View>
            </View>
          }
        />

        {/* Reply preview bar */}
        {replyTo && (
          <View style={[styles.replyBar, { backgroundColor: c.surface, borderLeftColor: c.accent }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyName, { color: c.accent }]} numberOfLines={1}>
                {replyTo.senderName}
              </Text>
              <Text style={[styles.replyText, { color: c.textDim }]} numberOfLines={1}>
                {replyTo.msg.text}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={c.textDim} />
            </TouchableOpacity>
          </View>
        )}

        {/* Edit indicator */}
        {editing && (
          <View style={[styles.replyBar, { backgroundColor: c.surface, borderLeftColor: '#ffb020' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyName, { color: '#ffb020' }]}>Editing...</Text>
              <Text style={[styles.replyText, { color: c.textDim }]} numberOfLines={1}>
                {editing.text}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { setEditing(null); setText(''); }}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={c.textDim} />
            </TouchableOpacity>
          </View>
        )}

        {/* Composer */}
        <View style={[styles.composer, { backgroundColor: c.background }]}>
          {recording ? (
            <View style={[styles.recBar, { backgroundColor: c.inputBg }]}>
              <View style={styles.recDot} />
              <Text style={[styles.recText, { color: c.text }]}>
                Recording... {Math.floor(recSecs / 60)}:{(recSecs % 60).toString().padStart(2, '0')}
              </Text>
              <TouchableOpacity onPress={() => stopVoice(false)} style={styles.iconBtn} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={22} color="#ff5a5a" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => stopVoice(true)} style={[styles.sendBtn, { backgroundColor: c.accent }]} activeOpacity={0.8}>
                <Ionicons name="send" size={21} color={c.textOnAccent} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
                <TextInput
                  value={text}
                  onChangeText={onTextChange}
                  placeholder={effectiveOffline ? 'Message (will queue while offline)' : 'Message'}
                  placeholderTextColor={c.textDim}
                  multiline
                  style={[styles.input, { color: c.text, fontFamily: font.family }]}
                />
                {/* Schedule button */}
                <TouchableOpacity onPress={() => setSchedOpen(true)} style={styles.iconBtn} activeOpacity={0.7}>
                  <Ionicons name="time-outline" size={22} color={c.textDim} />
                </TouchableOpacity>
                {/* Attach button */}
                <TouchableOpacity onPress={() => setAttachOpen(true)} style={styles.iconBtn} activeOpacity={0.7}>
                  <Ionicons name="attach-outline" size={23} color={c.textDim} />
                </TouchableOpacity>
              </View>
              {text.trim() ? (
                <TouchableOpacity
                  onPress={send}
                  style={[styles.sendBtn, { backgroundColor: c.accent }]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={editing ? 'checkmark' : effectiveOffline ? 'time-outline' : 'send'}
                    size={21}
                    color={c.textOnAccent}
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={startVoice}
                  disabled={sendingVoice}
                  style={[styles.sendBtn, { backgroundColor: c.accent, opacity: sendingVoice ? 0.55 : 1 }]}
                  activeOpacity={0.8}
                >
                  {sendingVoice
                    ? <ActivityIndicator size="small" color={c.textOnAccent} />
                    : <Ionicons name="mic" size={21} color={c.textOnAccent} />}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Attach menu ── */}
      <Modal visible={attachOpen} animationType="slide" transparent>
        <TouchableOpacity style={styles.sheetWrap} activeOpacity={1} onPress={() => setAttachOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: c.surface }]}>
            <Text style={[styles.sheetTitle, { color: c.text, fontFamily: font.family }]}>Share</Text>
            <View style={styles.attachGrid}>
              {[
                { key: 'photo', icon: 'image-outline', label: 'Photo' },
                { key: 'video', icon: 'videocam-outline', label: 'Video' },
                { key: 'camera', icon: 'camera-outline', label: 'Camera' },
                { key: 'document', icon: 'document-outline', label: 'Document' },
                { key: 'location', icon: 'location-outline', label: 'Location' },
                { key: 'contact', icon: 'person-outline', label: 'Contact' },
                { key: 'poll', icon: 'bar-chart-outline', label: 'Poll' },
              ].map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={styles.attachItem}
                  activeOpacity={0.7}
                  onPress={() => handleAttach(a.key)}
                >
                  <View style={[styles.attachCircle, { backgroundColor: c.inputBg }]}>
                    <Ionicons name={a.icon as any} size={26} color={c.accent} />
                  </View>
                  <Text style={[styles.attachLabel, { color: c.textDim }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.sheetTitle, { color: c.text, fontFamily: font.family, marginTop: 6 }]}>Stickers</Text>
            <View style={styles.stickerRow}>
              {STICKERS.map((s) => (
                <TouchableOpacity key={s} onPress={() => sendSticker(s)} style={styles.stickerBtn} activeOpacity={0.7}>
                  <Text style={styles.stickerEmoji}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Media preview (photo/video before send) ── */}
      <Modal visible={!!preview} animationType="slide" transparent>
        <View style={styles.previewWrap}>
          <View style={[styles.previewCard, { backgroundColor: c.surface }]}>
            {preview?.kind === 'image' && (
              <Image source={{ uri: preview.picked.uri }} style={styles.previewImg} resizeMode="contain" />
            )}
            {preview?.kind === 'video' && (
              <View style={[styles.previewImg, styles.previewVideoPh, { backgroundColor: c.inputBg }]}>
                <Ionicons name="videocam" size={48} color={c.textDim} />
                <Text style={[styles.previewVideoText, { color: c.textDim }]}>
                  {preview.picked.fileName ?? 'Video'}
                </Text>
              </View>
            )}
            <TextInput
              value={previewCaption}
              onChangeText={setPreviewCaption}
              placeholder="Add a caption..."
              placeholderTextColor={c.textDim}
              style={[styles.previewCaption, { color: c.text, borderColor: c.divider, fontFamily: font.family }]}
            />
            {preview?.kind === 'image' && (
              <TouchableOpacity
                style={[styles.viewOnceToggle, { borderColor: previewViewOnce ? c.accent : c.divider, backgroundColor: previewViewOnce ? c.accent : 'transparent' }]}
                onPress={() => setPreviewViewOnce((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={[styles.viewOnceText, { color: previewViewOnce ? c.textOnAccent : c.textDim }]}>
                  1  View once {previewViewOnce ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                onPress={() => { setPreview(null); setPreviewCaption(''); setPreviewViewOnce(false); }}
                style={styles.modalBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalBtnText, { color: c.textDim }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => preview && sendPicked(preview.picked, preview.kind)}
                disabled={sendingMedia}
                style={[styles.modalBtn, styles.postBtn, { backgroundColor: c.accent, opacity: sendingMedia ? 0.5 : 1 }]}
                activeOpacity={0.8}
              >
                {sendingMedia
                  ? <ActivityIndicator size="small" color={c.textOnAccent} />
                  : <Text style={[styles.modalBtnText, { color: c.textOnAccent }]}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Poll modal ── */}
      <Modal visible={pollOpen} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>Create Poll</Text>
            <TextInput
              value={pollQ}
              onChangeText={setPollQ}
              placeholder="Ask a question..."
              placeholderTextColor={c.textDim}
              style={[styles.input2, { color: c.text, borderColor: c.divider, fontFamily: font.family }]}
            />
            <ScrollView style={{ maxHeight: 220 }}>
              {pollOpts.map((o, i) => (
                <View key={i} style={styles.pollOptRow}>
                  <TextInput
                    value={o}
                    onChangeText={(t) => setPollOpts((prev) => prev.map((p, j) => (j === i ? t : p)))}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor={c.textDim}
                    style={[styles.input2, { flex: 1, color: c.text, borderColor: c.divider, fontFamily: font.family }]}
                  />
                  {pollOpts.length > 2 && (
                    <TouchableOpacity
                      onPress={() => setPollOpts((prev) => prev.filter((_, j) => j !== i))}
                      style={styles.iconBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={20} color="#ff5a5a" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setPollOpts((prev) => [...prev, ''])}
              style={styles.addOptBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color={c.accent} />
              <Text style={[styles.addOptText, { color: c.accent }]}>Add option</Text>
            </TouchableOpacity>
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setPollOpen(false)} style={styles.modalBtn} activeOpacity={0.7}>
                <Text style={[styles.modalBtnText, { color: c.textDim }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={sendPoll}
                style={[styles.modalBtn, styles.postBtn, { backgroundColor: c.accent }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnText, { color: c.textOnAccent }]}>Send Poll</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Schedule modal ── */}
      <Modal visible={schedOpen} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>Schedule Message</Text>
            <Text style={[styles.schedHint, { color: c.textDim }]}>
              Pehle upar message likho, phir waqt chuno:
            </Text>
            {[
              { label: 'In 1 hour', at: Date.now() + 3600 * 1000 },
              { label: 'Tonight 9 PM', at: (() => { const d = new Date(); d.setHours(21, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); return d.getTime(); })() },
              { label: 'Tomorrow 9 AM', at: (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); })() },
            ].map((p) => (
              <TouchableOpacity
                key={p.label}
                style={[styles.schedRow, { borderColor: c.divider }]}
                activeOpacity={0.7}
                onPress={() => schedule(p.at, p.label.toLowerCase())}
              >
                <Ionicons name="time-outline" size={20} color={c.accent} />
                <Text style={[styles.schedLabel, { color: c.text, fontFamily: font.family }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setSchedOpen(false)} style={[styles.modalBtn, { alignSelf: 'flex-end', marginTop: 8 }]} activeOpacity={0.7}>
              <Text style={[styles.modalBtnText, { color: c.textDim }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Contact modal ── */}
      <Modal visible={contactOpen} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>Share Contact</Text>
            <TextInput
              value={contactName}
              onChangeText={setContactName}
              placeholder="Name"
              placeholderTextColor={c.textDim}
              style={[styles.input2, { color: c.text, borderColor: c.divider, fontFamily: font.family }]}
            />
            <TextInput
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="Phone number"
              placeholderTextColor={c.textDim}
              keyboardType="phone-pad"
              style={[styles.input2, { color: c.text, borderColor: c.divider, fontFamily: font.family }]}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setContactOpen(false)} style={styles.modalBtn} activeOpacity={0.7}>
                <Text style={[styles.modalBtnText, { color: c.textDim }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={sendContact}
                style={[styles.modalBtn, styles.postBtn, { backgroundColor: c.accent }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnText, { color: c.textOnAccent }]}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Forward picker ── */}
      <Modal visible={!!forwardMsg} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: c.surface, maxHeight: '70%' }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>Forward to...</Text>
            <FlatList
              data={forwardChats}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const name = item.isGroup ? (item.groupName ?? 'Group') : (item.names[item.participants.find((p) => p !== user?.uid) ?? ''] ?? 'Unknown');
                return (
                  <TouchableOpacity
                    style={[styles.fwdRow, { borderBottomColor: c.divider }]}
                    activeOpacity={0.7}
                    onPress={() => doForward(item.id)}
                  >
                    <Avatar name={name} size={42} colors={c} />
                    <Text style={[styles.fwdName, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Ionicons name="send-outline" size={18} color={c.accent} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: c.textDim }]}>No other chats yet.</Text>
              }
            />
            <TouchableOpacity onPress={closeForward} style={[styles.modalBtn, { alignSelf: 'flex-end', marginTop: 8 }]} activeOpacity={0.7}>
              <Text style={[styles.modalBtnText, { color: c.textDim }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── View-once viewer ── */}
      <Modal visible={!!viewOnceMsg} animationType="fade" transparent>
        <View style={styles.voWrap}>
          <TouchableOpacity style={styles.voClose} onPress={closeViewOnce} activeOpacity={0.7}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {viewOnceMsg?.mediaUrl ? (
            <Image source={{ uri: viewOnceMsg.mediaUrl }} style={styles.voImage} resizeMode="contain" />
          ) : (
            <Text style={styles.voText}>{viewOnceMsg?.text ?? ''}</Text>
          )}
          <Text style={styles.voHint}>View once — closes after viewing</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 8 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 2 },
  headerText: { flex: 1, marginLeft: 10 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center' },
  headerName: { fontSize: 16.5, fontWeight: '700' },
  headerStatus: { fontSize: 12, marginTop: 1 },
  iconBtn: { padding: 8 },
  list: { paddingVertical: 12, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: -1 }], paddingHorizontal: 30 },
  emptyCard: { borderRadius: 12, padding: 16 },
  emptyText: { fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 8 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 4, marginRight: 8 },
  input: { flex: 1, fontSize: 16, maxHeight: 110, paddingVertical: 8 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  recBar: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 4 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff3b30', marginRight: 10 },
  recText: { flex: 1, fontSize: 14, fontWeight: '600' },
  // Reply / edit bar
  replyBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 10, marginBottom: 6, paddingLeft: 12, paddingRight: 4, paddingVertical: 8,
    borderLeftWidth: 4, borderRadius: 8,
  },
  replyName: { fontSize: 13, fontWeight: '700' },
  replyText: { fontSize: 13, marginTop: 1 },
  // Attach sheet
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  attachItem: { width: '25%', alignItems: 'center', marginBottom: 14 },
  attachCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  attachLabel: { fontSize: 11.5, marginTop: 5 },
  stickerRow: { flexDirection: 'row', flexWrap: 'wrap' },
  stickerBtn: { padding: 8 },
  stickerEmoji: { fontSize: 34 },
  // Generic modal
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  input2: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 10 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  postBtn: { marginLeft: 8 },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
  // Preview
  previewWrap: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 20 },
  previewCard: { borderRadius: 18, padding: 16 },
  previewImg: { width: '100%', height: 280, borderRadius: 12, marginBottom: 12 },
  previewVideoPh: { alignItems: 'center', justifyContent: 'center' },
  previewVideoText: { marginTop: 8, fontSize: 13 },
  previewCaption: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 10 },
  viewOnceToggle: { borderWidth: 1.5, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start', marginBottom: 6 },
  viewOnceText: { fontSize: 13, fontWeight: '700' },
  // Poll
  pollOptRow: { flexDirection: 'row', alignItems: 'center' },
  addOptBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  addOptText: { fontSize: 14, fontWeight: '600', marginLeft: 6 },
  // Schedule
  schedHint: { fontSize: 13, marginBottom: 12 },
  schedRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 8 },
  schedLabel: { fontSize: 15, marginLeft: 12 },
  // Forward
  fwdRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  fwdName: { flex: 1, fontSize: 15.5, marginLeft: 12 },
  // View-once viewer
  voWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  voClose: { position: 'absolute', top: 50, right: 20, zIndex: 2, padding: 8 },
  voImage: { width: '92%', height: '70%' },
  voText: { color: '#fff', fontSize: 18, paddingHorizontal: 30, textAlign: 'center' },
  voHint: { color: '#999', fontSize: 12, marginTop: 16 },
});
