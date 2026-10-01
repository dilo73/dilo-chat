// ─── Starred messages: all starred messages across chats ───────────────────
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { useSettings } from '../theme/SettingsContext';
import { chatDb, Chat, ChatMessage } from '../lib/db';
import { formatListTime } from '../lib/format';
import { Avatar } from '../components/Avatar';

interface StarredEntry {
  chat: Chat;
  message: ChatMessage;
}

export default function StarredScreen() {
  const { user } = useAuth();
  const { theme, font } = useSettings();
  const c = theme.colors;
  const [entries, setEntries] = useState<StarredEntry[]>([]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const byChat = new Map<string, { chat: Chat; msgs: ChatMessage[] }>();

    const rebuild = () => {
      if (cancelled) return;
      const list: StarredEntry[] = [];
      byChat.forEach(({ chat, msgs }) => {
        msgs
          .filter((m) => m.starredBy?.includes(uid))
          .forEach((m) => list.push({ chat, message: m }));
      });
      list.sort((a, b) => b.message.createdAt - a.message.createdAt);
      setEntries(list);
    };

    const unsubChats = chatDb.subscribeChats(uid, (chats) => {
      if (cancelled) return;
      // Unsubscribe chats that disappeared.
      const ids = new Set(chats.map((ch) => ch.id));
      // Re-subscribe messages for each chat.
      unsubs.splice(0).forEach((u) => u());
      byChat.clear();
      chats.forEach((chat) => {
        byChat.set(chat.id, { chat, msgs: [] });
        unsubs.push(
          chatDb.subscribeMessages(chat.id, (msgs) => {
            byChat.set(chat.id, { chat, msgs });
            rebuild();
          }),
        );
      });
      // Remove stale.
      [...byChat.keys()].forEach((id) => { if (!ids.has(id)) byChat.delete(id); });
      rebuild();
    });

    return () => {
      cancelled = true;
      unsubChats();
      unsubs.forEach((u) => u());
    };
  }, [user?.uid]);

  const chatName = (chat: Chat) => {
    if (chat.isGroup) return chat.groupName ?? 'Group';
    const other = chat.participants.find((p) => p !== user?.uid);
    return (other && chat.names[other]) ?? 'Chat';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>
          Starred messages
        </Text>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => `${item.chat.id}_${item.message.id}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: c.divider }]}
            onPress={() => router.push(`/chat/${item.chat.id}`)}
            activeOpacity={0.7}
          >
            <Avatar name={chatName(item.chat)} colors={c} size={46} />
            <View style={styles.middle}>
              <Text style={[styles.chatName, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                {chatName(item.chat)}
              </Text>
              <Text style={[styles.msgText, { color: c.textDim, fontFamily: font.family }]} numberOfLines={2}>
                {item.message.type === 'voice' ? '🎤 Voice message' : item.message.text}
              </Text>
              <Text style={[styles.time, { color: c.textDim }]}>
                {formatListTime(item.message.createdAt)}
              </Text>
            </View>
            <Ionicons name="star" size={18} color={c.accent} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="star-outline" size={52} color={c.textDim} />
            <Text style={[styles.emptyText, { color: c.textDim }]}>
              Koi starred message nahi.{'\n'}Kisi message ko star karo taake yahan save rahe.
            </Text>
          </View>
        }
        contentContainerStyle={entries.length === 0 ? { flex: 1 } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 8 },
  title: { fontSize: 19, fontWeight: '700', marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  middle: { flex: 1, marginLeft: 12, marginRight: 8 },
  chatName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  msgText: { fontSize: 13.5, lineHeight: 19 },
  time: { fontSize: 11.5, marginTop: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 14, lineHeight: 22 },
});
