// ─── Chat list (WhatsApp-style) ────────────────────────────────────────────
// Search, pinned chats, archived section, folder filters, long-press menu,
// join-group-by-code, mute icons.
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { chatDb, Chat } from '../../lib/db';
import { useEffectiveOffline } from '../../lib/net';
import { ChatListItem } from '../../components/ChatListItem';
import { OfflineBanner } from '../../components/OfflineBanner';

const FOLDERS = ['Work', 'Family', 'Friends'] as const;

function chatDisplayName(chat: Chat, currentUid: string): string {
  if (chat.isGroup) return chat.groupName ?? 'Group';
  const otherUid = chat.participants.find((p) => p !== currentUid) ?? currentUid;
  return chat.names[otherUid] ?? 'Unknown';
}

export default function ChatsScreen() {
  const { user } = useAuth();
  const { theme, font } = useSettings();
  const effectiveOffline = useEffectiveOffline();
  const c = theme.colors;
  const uid = user?.uid ?? '';

  const [chats, setChats] = useState<Chat[]>([]);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<string | null>(null); // null = All
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [menuChat, setMenuChat] = useState<Chat | null>(null);
  const [folderPickChat, setFolderPickChat] = useState<Chat | null>(null);
  const [joinModal, setJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  // While offline we keep the last loaded list (listeners paused).
  useEffect(() => {
    if (!user || effectiveOffline) return;
    return chatDb.subscribeChats(user.uid, setChats);
  }, [user?.uid, effectiveOffline]);

  const openChat = (chat: Chat) => router.push(`/chat/${chat.id}`);

  // ── Filtering & sorting ────────────────────────────────────────────────
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = chats.filter((ch) => {
      if (ch.archived?.[uid]) return false; // archived → separate section
      if (folder && (ch.folder ?? '').toLowerCase() !== folder.toLowerCase()) return false;
      if (q) {
        const name = chatDisplayName(ch, uid).toLowerCase();
        const last = (ch.lastMessage ?? '').toLowerCase();
        if (!name.includes(q) && !last.includes(q)) return false;
      }
      return true;
    });
    // pinned first, then most recent
    list = [...list].sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [chats, query, folder, uid]);

  const archived = useMemo(
    () => chats.filter((ch) => ch.archived?.[uid]),
    [chats, uid],
  );

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    chats.forEach((ch) => {
      if (ch.archived?.[uid] || !ch.folder) return;
      const f = ch.folder;
      counts[f] = (counts[f] ?? 0) + 1;
    });
    return counts;
  }, [chats, uid]);

  const activeChips = useMemo(() => {
    const chips: string[] = [];
    FOLDERS.forEach((f) => { if (folderCounts[f]) chips.push(f); });
    Object.keys(folderCounts).forEach((f) => {
      if (!(FOLDERS as readonly string[]).includes(f)) chips.push(f);
    });
    return chips;
  }, [folderCounts]);

  // ── Actions ────────────────────────────────────────────────────────────
  const togglePin = (chat: Chat) => chatDb.setPinned(chat.id, !chat.pinned).catch(() => {});
  const toggleArchive = (chat: Chat) =>
    chatDb.setArchived(chat.id, uid, !chat.archived?.[uid]).catch(() => {});
  const toggleMute = (chat: Chat) =>
    chatDb.setMuted(chat.id, uid, !chat.muted?.[uid]).catch(() => {});
  const moveToFolder = (chat: Chat, f: string | null) => {
    chatDb.setChatFolder(chat.id, f).catch(() => {});
    setFolderPickChat(null);
    setMenuChat(null);
  };

  const openMenu = (chat: Chat) => setMenuChat(chat);

  const confirmDelete = (chat: Chat) => {
    Alert.alert(
      'Delete chat',
      `Delete "${chatDisplayName(chat, uid)}"? It will be archived.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            chatDb.setArchived(chat.id, uid, true).catch(() => {});
            setMenuChat(null);
          },
        },
      ],
    );
  };

  const joinByCode = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code || !user) return;
    setJoining(true);
    try {
      const chatId = await chatDb.joinGroupByCode(code, user.uid);
      if (chatId) {
        setJoinModal(false);
        setInviteCode('');
        router.push(`/chat/${chatId}`);
      } else {
        Alert.alert('Invalid code', 'Koi group is code se nahi mila. Dobara check karo.');
      }
    } catch {
      Alert.alert('Error', 'Join nahi ho saka. Internet check karo.');
    } finally {
      setJoining(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: Chat }) => (
    <ChatListItem
      chat={item}
      currentUid={uid}
      theme={theme}
      font={font}
      onPress={() => openChat(item)}
      onLongPress={() => openMenu(item)}
    />
  );

  const menuRows = menuChat ? [
    {
      label: menuChat.pinned ? 'Unpin chat' : 'Pin chat',
      icon: 'pin-outline' as const,
      onPress: () => { togglePin(menuChat); setMenuChat(null); },
    },
    {
      label: menuChat.archived?.[uid] ? 'Unarchive' : 'Archive chat',
      icon: 'archive-outline' as const,
      onPress: () => { toggleArchive(menuChat); setMenuChat(null); },
    },
    {
      label: menuChat.muted?.[uid] ? 'Unmute' : 'Mute',
      icon: (menuChat.muted?.[uid] ? 'volume-high-outline' : 'volume-mute-outline') as const,
      onPress: () => { toggleMute(menuChat); setMenuChat(null); },
    },
    {
      label: `Move to folder${menuChat.folder ? ` (${menuChat.folder})` : ''}`,
      icon: 'folder-outline' as const,
      onPress: () => { setFolderPickChat(menuChat); },
    },
    {
      label: 'Delete chat',
      icon: 'trash-outline' as const,
      danger: true,
      onPress: () => confirmDelete(menuChat),
    },
  ] : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}

      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <View>
          <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Dilo Chat</Text>
          <Text style={[styles.subtitle, { color: c.textDim }]}>
            {effectiveOffline ? 'Offline mode' : 'VIP Edition ✨'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() => setJoinModal(true)}
          >
            <Ionicons name="link-outline" size={22} color={c.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/broadcast')}
          >
            <Ionicons name="megaphone-outline" size={22} color={c.text} />
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

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: c.background }]}>
        <View style={[styles.searchBar, { backgroundColor: c.inputBg }]}>
          <Ionicons name="search-outline" size={18} color={c.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search chats..."
            placeholderTextColor={c.textDim}
            style={[styles.searchInput, { color: c.text, fontFamily: font.family }]}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color={c.textDim} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Folder chips */}
      {activeChips.length > 0 && (
        <View style={styles.chipsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <TouchableOpacity
              onPress={() => setFolder(null)}
              style={[styles.chip, { backgroundColor: folder === null ? c.accent : c.surface, borderColor: c.divider }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: folder === null ? c.textOnAccent : c.textDim }]}>All</Text>
            </TouchableOpacity>
            {activeChips.map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setFolder(folder === f ? null : f)}
                style={[styles.chip, { backgroundColor: folder === f ? c.accent : c.surface, borderColor: c.divider }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, { color: folder === f ? c.textOnAccent : c.textDim }]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Archived row */}
      {archived.length > 0 && (
        <TouchableOpacity
          style={[styles.archivedRow, { borderBottomColor: c.divider }]}
          onPress={() => setArchivedOpen((v) => !v)}
          activeOpacity={0.7}
        >
          <Ionicons name="archive-outline" size={20} color={c.textDim} />
          <Text style={[styles.archivedText, { color: c.text, fontFamily: font.family }]}>
            Archived ({archived.length})
          </Text>
          <Ionicons
            name={archivedOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={c.textDim}
          />
        </TouchableOpacity>
      )}
      {archivedOpen && archived.map((ch) => (
        <View key={ch.id}>
          {renderItem({ item: ch })}
        </View>
      ))}

      {/* Chat list */}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: c.surface }]}>
              <Ionicons name="chatbubbles-outline" size={52} color={c.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text, fontFamily: font.family }]}>
              {query || folder ? 'No matching chats' : 'No chats yet'}
            </Text>
            <Text style={[styles.emptySub, { color: c.textDim }]}>
              {query || folder
                ? 'Try a different search or folder.'
                : 'Tap the button below to find friends and start chatting.'}
            </Text>
          </View>
        }
        contentContainerStyle={visible.length === 0 ? { flex: 1 } : undefined}
      />

      {/* FAB → contacts */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: c.accent }]}
        onPress={() => router.push('/(tabs)/contacts')}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubble-ellipses" size={26} color={c.textOnAccent} />
      </TouchableOpacity>

      {/* Long-press action menu */}
      <Modal visible={!!menuChat} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuChat(null)}
        >
          <View style={[styles.menu, { backgroundColor: c.surface }]}>
            {menuChat && (
              <Text style={[styles.menuTitle, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                {chatDisplayName(menuChat, uid)}
              </Text>
            )}
            {menuRows.map((row, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.menuItem, { borderTopColor: c.divider, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}
                onPress={row.onPress}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={row.icon}
                  size={20}
                  color={row.danger ? '#ff5a5a' : c.text}
                />
                <Text style={[styles.menuLabel, { color: row.danger ? '#ff5a5a' : c.text, fontFamily: font.family }]}>
                  {row.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Move to folder picker */}
      <Modal visible={!!folderPickChat} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => { setFolderPickChat(null); setMenuChat(null); }}
        >
          <View style={[styles.menu, { backgroundColor: c.surface }]}>
            <Text style={[styles.menuTitle, { color: c.text, fontFamily: font.family }]}>
              Move to folder
            </Text>
            {[...FOLDERS, 'None'].map((f, i) => {
              const value = f === 'None' ? null : f;
              const selected = (folderPickChat?.folder ?? null) === value;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.menuItem, { borderTopColor: c.divider, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}
                  onPress={() => folderPickChat && moveToFolder(folderPickChat, value)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="folder-outline" size={20} color={c.text} />
                  <Text style={[styles.menuLabel, { color: c.text, fontFamily: font.family, fontWeight: selected ? '700' : '400' }]}>
                    {f}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={20} color={c.accent} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Join group by code */}
      <Modal visible={joinModal} animationType="slide" transparent>
        <View style={styles.menuBackdrop}>
          <View style={[styles.joinModal, { backgroundColor: c.surface }]}>
            <Text style={[styles.menuTitle, { color: c.text, fontFamily: font.family }]}>
              Join group with code
            </Text>
            <Text style={[styles.joinHint, { color: c.textDim }]}>
              Ask the group admin for the invite code.
            </Text>
            <TextInput
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              placeholder="ENTER CODE"
              placeholderTextColor={c.textDim}
              autoCapitalize="characters"
              maxLength={12}
              style={[styles.codeInput, { color: c.text, borderColor: c.divider, fontFamily: font.family }]}
            />
            <View style={styles.joinBtns}>
              <TouchableOpacity
                onPress={() => { setJoinModal(false); setInviteCode(''); }}
                style={styles.joinBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.joinBtnText, { color: c.textDim }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={joinByCode}
                disabled={!inviteCode.trim() || joining}
                style={[styles.joinBtn, styles.joinGo, { backgroundColor: c.accent, opacity: inviteCode.trim() && !joining ? 1 : 0.5 }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.joinBtnText, { color: c.textOnAccent }]}>
                  {joining ? 'Joining...' : 'Join'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  searchWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 15, marginLeft: 8 },
  chipsWrap: { paddingVertical: 6 },
  chips: { paddingHorizontal: 14 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  chipText: { fontSize: 13.5, fontWeight: '600' },
  archivedRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  archivedText: { flex: 1, fontSize: 15, fontWeight: '600', marginLeft: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 19, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  fab: {
    position: 'absolute', right: 20, bottom: 26, width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  menu: { width: '100%', borderRadius: 16, paddingVertical: 6, overflow: 'hidden' },
  menuTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 18, paddingVertical: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13 },
  menuLabel: { fontSize: 15.5, marginLeft: 14 },
  joinModal: { width: '100%', borderRadius: 16, padding: 20 },
  joinHint: { fontSize: 13.5, marginTop: 4, marginBottom: 14 },
  codeInput: {
    borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 20,
    textAlign: 'center', letterSpacing: 3, fontWeight: '700',
  },
  joinBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  joinBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  joinGo: { marginLeft: 8 },
  joinBtnText: { fontSize: 15, fontWeight: '600' },
});
