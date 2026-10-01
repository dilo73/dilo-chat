// ─── Contacts: everyone registered in the app ──────────────────────────────
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { chatDb, UserProfile } from '../../lib/db';
import { useEffectiveOffline } from '../../lib/net';
import { Avatar } from '../../components/Avatar';
import { OfflineBanner } from '../../components/OfflineBanner';

export default function ContactsScreen() {
  const { user } = useAuth();
  const { theme, font } = useSettings();
  const effectiveOffline = useEffectiveOffline();
  const c = theme.colors;
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [groupModal, setGroupModal] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (effectiveOffline) return; // keep last list while offline
    return chatDb.subscribeUsers((all) =>
      setUsers(all.filter((u) => u.uid !== user?.uid)));
  }, [user?.uid, effectiveOffline]);

  const startChat = async (other: UserProfile) => {
    if (!user || starting) return;
    setStarting(other.uid);
    try {
      const id = await chatDb.getOrCreateChat(user.uid, other.uid);
      router.push(`/chat/${id}`);
    } finally {
      setStarting(null);
    }
  };

  const toggleSelect = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const createGroup = async () => {
    if (!user || creating || selected.size === 0) return;
    if (!groupName.trim()) {
      Alert.alert('Group name', 'Group ka naam likho!');
      return;
    }
    setCreating(true);
    try {
      const id = await chatDb.createGroup(groupName.trim(), user.uid, [...selected]);
      setGroupModal(false);
      setSelected(new Set());
      setGroupName('');
      router.push(`/chat/${id}`);
    } catch {
      Alert.alert('Error', 'Group ban nahi saka. Dobara try karo.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Contacts</Text>
          <Text style={[styles.subtitle, { color: c.textDim }]}>
            {users.length} {users.length === 1 ? 'person' : 'people'} on Dilo Chat
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setGroupModal(true)}
          style={[styles.groupBtn, { backgroundColor: c.accent }]}
          activeOpacity={0.8}
        >
          <Ionicons name="people" size={18} color={c.textOnAccent} />
          <Text style={[styles.groupBtnText, { color: c.textOnAccent }]}>New Group</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: c.divider }]}
            onPress={() => startChat(item)}
            activeOpacity={0.7}
          >
            <View>
              <Avatar name={item.name} colors={c} />
              {item.online && <View style={[styles.dot, { backgroundColor: c.badge, borderColor: c.background }]} />}
            </View>
            <View style={styles.middle}>
              <Text style={[styles.name, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.phone, { color: c.textDim }]} numberOfLines={1}>
                {item.online ? 'online' : item.phone}
              </Text>
            </View>
            {starting === item.uid
              ? <ActivityIndicator color={c.accent} />
              : <Ionicons name="chatbubble-outline" size={20} color={c.accent} />}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={52} color={c.textDim} />
            <Text style={[styles.emptyText, { color: c.textDim }]}>
              No contacts yet.{'\n'}Ask a friend to install Dilo Chat and register!
            </Text>
          </View>
        }
        contentContainerStyle={users.length === 0 ? { flex: 1 } : undefined}
      />

      {/* New Group modal */}
      <Modal visible={groupModal} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>New Group</Text>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name..."
              placeholderTextColor={c.textDim}
              maxLength={50}
              style={[styles.input, { color: c.text, borderColor: c.divider, fontFamily: font.family }]}
            />
            <Text style={[styles.pickLabel, { color: c.textDim }]}>
              Select members ({selected.size} selected)
            </Text>
            <FlatList
              data={users}
              keyExtractor={(item) => item.uid}
              style={styles.memberList}
              renderItem={({ item }) => {
                const isSel = selected.has(item.uid);
                return (
                  <TouchableOpacity
                    style={[styles.memberRow, { borderBottomColor: c.divider }]}
                    onPress={() => toggleSelect(item.uid)}
                    activeOpacity={0.7}
                  >
                    <Avatar name={item.name} colors={c} size={40} />
                    <Text style={[styles.memberName, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.checkbox, { borderColor: c.accent, backgroundColor: isSel ? c.accent : 'transparent' }]}>
                      {isSel && <Ionicons name="checkmark" size={16} color={c.textOnAccent} />}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => { setGroupModal(false); setSelected(new Set()); }} style={styles.modalBtn} activeOpacity={0.7}>
                <Text style={[styles.modalBtnText, { color: c.textDim }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={createGroup}
                disabled={selected.size === 0 || creating}
                style={[styles.modalBtn, styles.postBtn, { backgroundColor: c.accent, opacity: selected.size > 0 && !creating ? 1 : 0.5 }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnText, { color: c.textOnAccent }]}>
                  {creating ? 'Creating...' : 'Create Group'}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 12.5, marginTop: 2 },
  groupBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  groupBtnText: { fontSize: 13.5, fontWeight: '700', marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  middle: { flex: 1, marginLeft: 13 },
  name: { fontSize: 16.5, fontWeight: '600', marginBottom: 2 },
  phone: { fontSize: 13.5 },
  dot: {
    position: 'absolute', right: 1, bottom: 1, width: 14, height: 14,
    borderRadius: 7, borderWidth: 2.5,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 14, lineHeight: 22 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 12 },
  pickLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  memberList: { maxHeight: 260 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  memberName: { flex: 1, fontSize: 15.5, marginLeft: 12 },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  postBtn: { marginLeft: 8 },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
});
