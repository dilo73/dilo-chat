// ─── Conversation screen ───────────────────────────────────────────────────
// Real-time messages, ticks, online status, offline queueing.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
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
  const listRef = useRef<FlatList>(null);

  const otherUid = chat?.participants.find((p) => p !== user?.uid);
  const otherName = otherUid ? chat?.names[otherUid] ?? 'Unknown' : 'Unknown';

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
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.chatBg }]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}

      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </TouchableOpacity>
        <Avatar name={otherName} size={40} colors={c} />
        <View style={styles.headerText}>
          <Text style={[styles.headerName, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
            {otherName}
          </Text>
          <Text style={[styles.headerStatus, { color: other?.online ? c.accent : c.textDim }]} numberOfLines={1}>
            {other ? presenceLabel(other.online, other.lastSeen) : ' '}
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
          <TouchableOpacity
            onPress={send}
            style={[styles.sendBtn, { backgroundColor: c.accent, opacity: text.trim() ? 1 : 0.55 }]}
            activeOpacity={0.8}
          >
            <Ionicons
              name={effectiveOffline ? 'time-outline' : 'send'}
              size={21}
              color={c.textOnAccent}
            />
          </TouchableOpacity>
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
});
