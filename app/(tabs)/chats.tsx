// ─── Chat list (WhatsApp-style) ────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { chatDb, Chat } from '../../lib/db';
import { useEffectiveOffline } from '../../lib/net';
import { ChatListItem } from '../../components/ChatListItem';
import { OfflineBanner } from '../../components/OfflineBanner';

export default function ChatsScreen() {
  const { user } = useAuth();
  const { theme, font } = useSettings();
  const effectiveOffline = useEffectiveOffline();
  const c = theme.colors;
  const [chats, setChats] = useState<Chat[]>([]);

  // While offline we keep the last loaded list (listeners paused).
  useEffect(() => {
    if (!user || effectiveOffline) return;
    return chatDb.subscribeChats(user.uid, setChats);
  }, [user?.uid, effectiveOffline]);

  const openChat = (chat: Chat) => router.push(`/chat/${chat.id}`);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <View>
          <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Dilo Chat</Text>
          <Text style={[styles.subtitle, { color: c.textDim }]}>
            {effectiveOffline ? 'Offline mode' : 'VIP Edition ✨'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
            <Ionicons name="search-outline" size={22} color={c.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)/contacts')}
          >
            <Ionicons name="create-outline" size={22} color={c.text} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatListItem
            chat={item}
            currentUid={user!.uid}
            theme={theme}
            font={font}
            onPress={() => openChat(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: c.surface }]}>
              <Ionicons name="chatbubbles-outline" size={52} color={c.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text, fontFamily: font.family }]}>
              No chats yet
            </Text>
            <Text style={[styles.emptySub, { color: c.textDim }]}>
              Tap the button below to find friends and start chatting.
            </Text>
          </View>
        }
        contentContainerStyle={chats.length === 0 ? { flex: 1 } : undefined}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: c.accent }]}
        onPress={() => router.push('/(tabs)/contacts')}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubble-ellipses" size={26} color={c.textOnAccent} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  headerActions: { flexDirection: 'row' },
  iconBtn: { padding: 8, marginLeft: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 19, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  fab: {
    position: 'absolute', right: 20, bottom: 26, width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
});
