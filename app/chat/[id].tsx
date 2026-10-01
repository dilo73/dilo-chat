// ─── Conversation screen ───────────────────────────────────────────────────
// Real-time messages, ticks, online status, offline queueing, voice messages.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { chatDb, Chat, ChatMessage, UserProfile } from '../../lib/db';
import { enqueueMessage, getQueued, QueuedMessage } from '../../lib/queue';
import { useEffectiveOffline } from '../../lib/net';
import { presenceLabel } from '../../lib/format';
import { MessageBubble, DisplayStatus } from '../../components/MessageBubble';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Avatar } from '../../components/Avatar';
import { startRecording, uploadVoice, Recording } from '../../lib/voice';

type DisplayMsg = Omit<ChatMessage, 'status'> & { status: ChatMessage['status'] | 'queued' };

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
  const listRef = useRef<FlatList>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isGroup = !!chat?.isGroup;
  const otherUid = !isGroup ? chat?.participants.find((p) => p !== user?.uid) : undefined;
  const otherName = otherUid ? chat?.names[otherUid] ?? 'Unknown' : 'Unknown';
  const headerTitle = isGroup ? (chat?.groupName ?? 'Group') : otherName;
  const headerSubtitle = isGroup
    ? `${chat?.participants.length ?? 0} members`
    : (other ? presenceLabel(other.online, other.lastSeen) : ' ');

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

  // Refresh queued messages whenever the screen is focused
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      if (id) getQueued(id).then((q) => { if (active) setQueued(q); });
      return () => { active = false; };
    }, [id]),
  );

  const displayMessages: DisplayMsg[] = useMemo(() => {
    const q: DisplayMsg[] = queued.map((m) => ({
      id: `q_${m.tempId}`, chatId: m.chatId, senderId: user?.uid ?? '',
      text: m.text, createdAt: m.createdAt, status: 'queued' as const,
    }));
    const all = [...messages, ...q].sort((a, b) => b.createdAt - a.createdAt);
    return all;
  }, [messages, queued, user?.uid]);

  const send = async () => {
    const t = text.trim();
    if (!t || !user || !id) return;
    setText('');
    if (effectiveOffline) {
      const item = await enqueueMessage(id, t);
      setQueued((q) => [...q, item]);
    } else {
      try {
        await chatDb.sendMessage(id, user.uid, t);
      } catch {
        // Send failed (probably offline) → queue it instead.
        const item = await enqueueMessage(id, t);
        setQueued((q) => [...q, item]);
      }
    }
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
  };

  const renderItem = ({ item }: { item: DisplayMsg }) => {
    const isMine = item.senderId === user?.uid;
    return (
      <MessageBubble
        message={item}
        isMine={isMine}
        theme={theme}
        font={font}
        singleTick={singleTick}
        statusOverride={item.status as DisplayStatus}
        senderName={isGroup && !isMine ? chat?.names[item.senderId] : undefined}
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
    recording?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.chatBg }]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}

      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </TouchableOpacity>
        <Avatar name={headerTitle} size={40} colors={c} />
        <View style={styles.headerText}>
          <Text style={[styles.headerName, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
            {headerTitle}
          </Text>
          <Text style={[styles.headerStatus, { color: !isGroup && other?.online ? c.accent : c.textDim }]} numberOfLines={1}>
            {headerSubtitle}
          </Text>
        </View>
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
                  onChangeText={setText}
                  placeholder={effectiveOffline ? 'Message (will queue while offline)' : 'Message'}
                  placeholderTextColor={c.textDim}
                  multiline
                  style={[styles.input, { color: c.text, fontFamily: font.family }]}
                />
                <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
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
                    name={effectiveOffline ? 'time-outline' : 'send'}
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
  headerText: { flex: 1, marginLeft: 10 },
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
});
