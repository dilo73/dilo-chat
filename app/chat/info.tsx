// ─── Chat info screen ──────────────────────────────────────────────────────
// Route: /chat/info?id=<chatId>
// Groups: members, admin controls, invite link, disappearing msgs, wallpaper.
// 1-on-1: contact info, block/unblock, mute. Export chat for both.
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch,
  Modal, FlatList, Alert, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { chatDb, Chat, UserProfile, ChatMessage } from '../../lib/db';
import { presenceLabel, formatTime } from '../../lib/format';
import { Avatar } from '../../components/Avatar';

const DISAPPEAR_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '24 hours', seconds: 24 * 3600 },
  { label: '7 days', seconds: 7 * 24 * 3600 },
];

const WALLPAPERS = [
  { label: 'Default', value: 'default' },
  { label: 'Dark Blue', value: '#0d1b2a' },
  { label: 'Dark Green', value: '#0b1f17' },
  { label: 'Purple', value: '#1a1033' },
  { label: 'Maroon', value: '#2a0f14' },
  { label: 'Slate', value: '#1c1c1e' },
];

function Row({ icon, label, value, onPress, danger }: {
  icon: string; label: string; value?: string; onPress?: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={rowStyles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Ionicons name={icon as any} size={22} color={danger ? '#f15c6d' : '#8696a0'} style={rowStyles.icon} />
      <View style={rowStyles.textWrap}>
        <Text style={[rowStyles.label, danger && rowStyles.dangerLabel]}>{label}</Text>
        {value ? <Text style={rowStyles.value} numberOfLines={1}>{value}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color="#8696a0" /> : null}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  icon: { marginRight: 14 },
  textWrap: { flex: 1 },
  label: { fontSize: 16, color: '#e9edef' },
  dangerLabel: { color: '#f15c6d' },
  value: { fontSize: 13.5, color: '#8696a0', marginTop: 2 },
});

export default function ChatInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { theme, font } = useSettings();
  const c = theme.colors;

  const [chat, setChat] = useState<Chat | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [other, setOther] = useState<UserProfile | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [disModal, setDisModal] = useState(false);
  const [wallModal, setWallModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    return chatDb.subscribeChat(id, setChat);
  }, [id]);

  useEffect(() => chatDb.subscribeUsers(setUsers), []);

  // 1-on-1: load the other person's profile + block state
  const isGroup = !!chat?.isGroup;
  const otherUid = !isGroup ? chat?.participants.find((p) => p !== user?.uid) : undefined;
  useEffect(() => {
    if (!otherUid) { setOther(null); return; }
    chatDb.getUser(otherUid).then(setOther).catch(() => {});
  }, [otherUid]);

  useEffect(() => {
    if (!user) return;
    chatDb.getUser(user.uid)
      .then((me) => setBlocked(!!otherUid && (me?.blockedUsers ?? []).includes(otherUid)))
      .catch(() => {});
  }, [user?.uid, otherUid]);

  const isAdmin = !!user && (chat?.adminIds ?? []).includes(user.uid);
  const muted = !!user && !!chat?.muted?.[user.uid];
  const title = isGroup ? (chat?.groupName ?? 'Group') : (chat && otherUid ? chat.names[otherUid] ?? 'Unknown' : 'Unknown');
  const subtitle = isGroup
    ? `${chat?.participants.length ?? 0} members`
    : (other ? presenceLabel(other.online, other.lastSeen) : '');
  const disappearLabel = DISAPPEAR_OPTIONS.find((o) => o.seconds === (chat?.disappearing ?? 0))?.label ?? 'Off';
  const wallpaperLabel = WALLPAPERS.find((w) => w.value === (chat?.wallpaper ?? 'default'))?.label ?? 'Default';

  const toggleMute = async () => {
    if (!user || !id) return;
    try {
      await chatDb.setMuted(id, user.uid, !muted);
    } catch { /* ignore */ }
  };

  const toggleBlock = async () => {
    if (!user || !otherUid) return;
    try {
      if (blocked) {
        await chatDb.unblockUser(user.uid, otherUid);
        setBlocked(false);
      } else {
        Alert.alert(
          'Block contact?',
          `${other?.name ?? 'This contact'} won't be able to message you.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block', style: 'destructive',
              onPress: async () => {
                await chatDb.blockUser(user.uid, otherUid);
                setBlocked(true);
              },
            },
          ],
        );
      }
    } catch { /* ignore */ }
  };

  const memberMenu = (memberUid: string) => {
    if (!isAdmin || !id || memberUid === user?.uid) return;
    const mName = chat?.names[memberUid] ?? 'Unknown';
    const alreadyAdmin = (chat?.adminIds ?? []).includes(memberUid);
    Alert.alert(mName, 'Choose an action', [
      { text: 'Cancel', style: 'cancel' },
      ...(alreadyAdmin ? [] : [{
        text: 'Make admin',
        onPress: () => chatDb.makeGroupAdmin(id, memberUid).catch(() => {}),
      }]),
      {
        text: 'Remove from group', style: 'destructive' as const,
        onPress: () => chatDb.removeGroupMember(id, memberUid).catch(() => {}),
      },
    ]);
  };

  const loadInviteCode = async () => {
    if (!id) return;
    try {
      const code = await chatDb.getInviteCode(id);
      setInviteCode(code);
    } catch { /* ignore */ }
  };

  const copyInvite = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(`Join "${title}" on Dilo Chat! Invite code: ${inviteCode}`);
    Alert.alert('Copied', 'Invite code copy ho gaya!');
  };

  const shareInvite = async () => {
    if (!inviteCode) return;
    try {
      await Share.share({ message: `Join "${title}" on Dilo Chat! Invite code: ${inviteCode}` });
    } catch { /* ignore */ }
  };

  const exportChat = async () => {
    if (!id || !chat || exporting) return;
    setExporting(true);
    try {
      const msgs: ChatMessage[] = await new Promise((resolve) => {
        const unsub = chatDb.subscribeMessages(id, (m) => {
          unsub();
          resolve(m);
        });
        setTimeout(() => { try { unsub(); } catch {} resolve([]); }, 8000);
      });
      const lines = msgs.map((m) => {
        const name = m.senderId === user?.uid ? 'You' : (chat.names[m.senderId] ?? m.senderId);
        const d = new Date(m.createdAt);
        const time = `${d.toLocaleDateString()} ${formatTime(m.createdAt)}`;
        return `[${time}] ${name}: ${m.text}`;
      });
      const header = `Dilo Chat export — ${title}\n${new Date().toLocaleString()}\n${'='.repeat(40)}\n\n`;
      const path = `${FileSystem.cacheDirectory}dilo-chat-export-${id}.txt`;
      await FileSystem.writeAsStringAsync(path, header + lines.join('\n'));
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(path);
      } else {
        Alert.alert('Export', 'Sharing is not available on this device.');
      }
    } catch {
      Alert.alert('Export', 'Chat export nahi ho saka.');
    } finally {
      setExporting(false);
    }
  };

  const nonMembers = users.filter(
    (u) => u.uid !== user?.uid && !(chat?.participants ?? []).includes(u.uid),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text, fontFamily: font.family }]}>Info</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView>
        {/* Profile block */}
        <View style={[styles.profile, { backgroundColor: c.surface }]}>
          {isGroup ? (
            <View style={[styles.groupIcon, { backgroundColor: c.accent }]}>
              <Text style={styles.groupEmoji}>👥</Text>
            </View>
          ) : (
            <Avatar name={title} size={88} colors={c} />
          )}
          <Text style={[styles.name, { color: c.text, fontFamily: font.family }]}>{title}</Text>
          <Text style={[styles.sub, { color: c.textDim }]}>{subtitle}</Text>
          {!isGroup && other?.phone ? (
            <Text style={[styles.sub, { color: c.textDim }]}>{other.phone}</Text>
          ) : null}
        </View>

        {/* Group members */}
        {isGroup && (
          <View style={[styles.section, { backgroundColor: c.surface }]}>
            <View style={[styles.sectionTitle, { borderBottomColor: c.divider }]}>
              <Text style={[styles.sectionTitleText, { color: c.textDim, fontFamily: font.family }]}>
                MEMBERS ({chat?.participants.length ?? 0})
              </Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => setAddModal(true)} style={styles.addBtn} activeOpacity={0.7}>
                  <Ionicons name="person-add-outline" size={20} color={c.accent} />
                </TouchableOpacity>
              )}
            </View>
            {(chat?.participants ?? []).map((p) => {
              const admin = (chat?.adminIds ?? []).includes(p);
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.memberRow, { borderBottomColor: c.divider }]}
                  onPress={() => memberMenu(p)}
                  activeOpacity={isAdmin && p !== user?.uid ? 0.7 : 1}
                >
                  <Avatar name={chat?.names[p] ?? 'Unknown'} size={42} colors={c} />
                  <View style={styles.memberText}>
                    <Text style={[styles.memberName, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                      {p === user?.uid ? 'You' : (chat?.names[p] ?? 'Unknown')}
                    </Text>
                    {admin && <Text style={[styles.adminBadge, { color: c.accent }]}>admin</Text>}
                  </View>
                  {isAdmin && p !== user?.uid && (
                    <Ionicons name="ellipsis-vertical" size={18} color={c.textDim} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Invite link (groups, admin) */}
        {isGroup && (
          <View style={[styles.section, { backgroundColor: c.surface }]}>
            {!inviteCode ? (
              <Row icon="link-outline" label="Invite link" value="Tap to generate" onPress={loadInviteCode} />
            ) : (
              <>
                <View style={[styles.inviteBox, { borderBottomColor: c.divider }]}>
                  <Text style={[styles.inviteLabel, { color: c.textDim }]}>Invite code</Text>
                  <Text style={[styles.inviteCode, { color: c.text, fontFamily: font.family }]} selectable>
                    {inviteCode}
                  </Text>
                </View>
                <View style={styles.inviteBtns}>
                  <TouchableOpacity onPress={copyInvite} style={[styles.inviteBtn, { backgroundColor: c.inputBg }]} activeOpacity={0.7}>
                    <Ionicons name="copy-outline" size={18} color={c.text} />
                    <Text style={[styles.inviteBtnText, { color: c.text }]}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={shareInvite} style={[styles.inviteBtn, { backgroundColor: c.accent }]} activeOpacity={0.7}>
                    <Ionicons name="share-social-outline" size={18} color={c.textOnAccent} />
                    <Text style={[styles.inviteBtnText, { color: c.textOnAccent }]}>Share</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* Settings */}
        <View style={[styles.section, { backgroundColor: c.surface }]}>
          <View style={[styles.muteRow, { borderBottomColor: c.divider }]}>
            <Ionicons name="notifications-off-outline" size={22} color={c.textDim} style={rowStyles.icon} />
            <Text style={[rowStyles.label, { color: c.text, fontFamily: font.family, flex: 1 }]}>Mute notifications</Text>
            <Switch value={muted} onValueChange={toggleMute} trackColor={{ true: c.accent }} />
          </View>
          <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider }}>
            <Row icon="timer-outline" label="Disappearing messages" value={disappearLabel} onPress={() => setDisModal(true)} />
          </View>
          <Row icon="image-outline" label="Chat wallpaper" value={wallpaperLabel} onPress={() => setWallModal(true)} />
        </View>

        {/* Export */}
        <View style={[styles.section, { backgroundColor: c.surface }]}>
          <TouchableOpacity
            style={styles.exportRow}
            onPress={exportChat}
            disabled={exporting}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={22} color={c.textDim} style={rowStyles.icon} />
            <Text style={[rowStyles.label, { color: c.text, fontFamily: font.family, flex: 1 }]}>Export chat</Text>
            {exporting ? <ActivityIndicator size="small" color={c.accent} /> : null}
          </TouchableOpacity>
        </View>

        {/* Block (1-on-1) */}
        {!isGroup && otherUid && (
          <View style={[styles.section, { backgroundColor: c.surface }]}>
            <TouchableOpacity style={styles.exportRow} onPress={toggleBlock} activeOpacity={0.7}>
              <Ionicons name="ban-outline" size={22} color={c.danger} style={rowStyles.icon} />
              <Text style={[rowStyles.label, { color: c.danger, fontFamily: font.family, flex: 1 }]}>
                {blocked ? 'Unblock contact' : 'Block contact'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add members modal */}
      <Modal visible={addModal} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>Add members</Text>
            <FlatList
              data={nonMembers}
              keyExtractor={(u) => u.uid}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: c.textDim }]}>No more contacts to add.</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.memberRow, { borderBottomColor: c.divider }]}
                  onPress={async () => {
                    if (!id) return;
                    try { await chatDb.addGroupMembers(id, [item.uid]); } catch {}
                  }}
                  activeOpacity={0.7}
                >
                  <Avatar name={item.name} size={42} colors={c} />
                  <Text style={[styles.memberName, { color: c.text, fontFamily: font.family, marginLeft: 12, flex: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {(chat?.participants ?? []).includes(item.uid)
                    ? <Ionicons name="checkmark-circle" size={22} color={c.accent} />
                    : <Ionicons name="add-circle-outline" size={22} color={c.textDim} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              onPress={() => setAddModal(false)}
              style={[styles.closeBtn, { backgroundColor: c.accent }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.closeBtnText, { color: c.textOnAccent }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Disappearing messages modal */}
      <Modal visible={disModal} animationType="fade" transparent>
        <View style={styles.centerWrap}>
          <View style={[styles.centerModal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>Disappearing messages</Text>
            {DISAPPEAR_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.label}
                style={[styles.optRow, { borderBottomColor: c.divider }]}
                onPress={async () => {
                  if (id) { try { await chatDb.setDisappearing(id, o.seconds); } catch {} }
                  setDisModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.optText, { color: c.text, fontFamily: font.family }]}>{o.label}</Text>
                {(chat?.disappearing ?? 0) === o.seconds && (
                  <Ionicons name="checkmark" size={20} color={c.accent} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setDisModal(false)} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={[styles.cancelText, { color: c.textDim }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Wallpaper modal */}
      <Modal visible={wallModal} animationType="fade" transparent>
        <View style={styles.centerWrap}>
          <View style={[styles.centerModal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>Chat wallpaper</Text>
            <View style={styles.wallGrid}>
              {WALLPAPERS.map((w) => {
                const selected = (chat?.wallpaper ?? 'default') === w.value;
                return (
                  <TouchableOpacity
                    key={w.value}
                    style={styles.wallItem}
                    onPress={async () => {
                      if (id) { try { await chatDb.setWallpaper(id, w.value); } catch {} }
                      setWallModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.wallSwatch,
                      { backgroundColor: w.value === 'default' ? c.chatBg : w.value,
                        borderColor: selected ? c.accent : c.divider,
                        borderWidth: selected ? 3 : 1 },
                    ]} />
                    <Text style={[styles.wallLabel, { color: c.textDim }]}>{w.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity onPress={() => setWallModal(false)} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={[styles.cancelText, { color: c.textDim }]}>Cancel</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 6, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 8, width: 44 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  profile: { alignItems: 'center', paddingVertical: 26, marginBottom: 12 },
  groupIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  groupEmoji: { fontSize: 40 },
  name: { fontSize: 21, fontWeight: '700', marginTop: 12 },
  sub: { fontSize: 13.5, marginTop: 4 },
  section: { marginBottom: 12 },
  sectionTitle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitleText: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.5 },
  addBtn: { padding: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  memberText: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 16 },
  adminBadge: { fontSize: 12, marginTop: 1 },
  muteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  exportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  inviteBox: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  inviteLabel: { fontSize: 12.5, marginBottom: 4 },
  inviteCode: { fontSize: 20, fontWeight: '700', letterSpacing: 2 },
  inviteBtns: { flexDirection: 'row', padding: 12 },
  inviteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, marginHorizontal: 4 },
  inviteBtnText: { fontSize: 14.5, fontWeight: '600', marginLeft: 6 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  closeBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { fontSize: 16, fontWeight: '700' },
  centerWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  centerModal: { width: '100%', borderRadius: 16, padding: 18 },
  optRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  optText: { fontSize: 16 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  wallGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  wallItem: { width: '30%', alignItems: 'center', marginBottom: 14 },
  wallSwatch: { width: 64, height: 64, borderRadius: 12 },
  wallLabel: { fontSize: 11.5, marginTop: 6, textAlign: 'center' },
});
