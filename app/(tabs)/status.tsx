// ─── Status tab (24h stories) ───────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { chatDb, StatusItem } from '../../lib/db';
import { Avatar } from '../../components/Avatar';
import { formatListTime } from '../../lib/format';

export default function StatusScreen() {
  const { user } = useAuth();
  const { theme, font } = useSettings();
  const c = theme.colors;
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewer, setViewer] = useState<StatusItem[] | null>(null);
  const [viewerIdx, setViewerIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => chatDb.subscribeStatuses(setStatuses), []);

  // Group by user, newest first within each user.
  const groups = useMemo(() => {
    const map = new Map<string, StatusItem[]>();
    statuses.forEach((s) => {
      const arr = map.get(s.userId) ?? [];
      arr.push(s);
      map.set(s.userId, arr);
    });
    const mine = user ? map.get(user.uid) : undefined;
    if (mine) map.delete(user!.uid);
    const rest = [...map.entries()].sort((a, b) => b[1][0].createdAt - a[1][0].createdAt);
    return { mine, rest };
  }, [statuses, user?.uid]);

  const post = async () => {
    const t = draft.trim();
    if (!t || !user) return;
    setPosting(true);
    try {
      await chatDb.postStatus(user.uid, user.name || user.phone || 'Unknown', t);
      setDraft('');
      setModalVisible(false);
    } catch {
      Alert.alert('Error', 'Status post nahi ho saka.');
    } finally {
      setPosting(false);
    }
  };

  const openViewer = (items: StatusItem[]) => {
    setViewer(items);
    setViewerIdx(0);
  };

  const renderRow = (userId: string, items: StatusItem[], isMine: boolean) => (
    <TouchableOpacity
      key={userId}
      style={[styles.row, { borderBottomColor: c.divider }]}
      activeOpacity={0.7}
      onPress={() => openViewer(items)}
    >
      <View style={[styles.ring, { borderColor: c.accent }]}>
        <Avatar name={items[0].userName} colors={c} size={48} />
      </View>
      <View style={styles.middle}>
        <Text style={[styles.name, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
          {isMine ? 'My Status' : items[0].userName}
        </Text>
        <Text style={[styles.time, { color: c.textDim }]} numberOfLines={1}>
          {formatListTime(items[0].createdAt)} • {items.length} update{items.length > 1 ? 's' : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.textDim} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Status</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={[styles.addBtn, { backgroundColor: c.accent }]} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={c.textOnAccent} />
        </TouchableOpacity>
      </View>

      <ScrollView>
        {groups.mine && renderRow(user!.uid, groups.mine, true)}
        {!groups.mine && (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: c.divider }]}
            activeOpacity={0.7}
            onPress={() => setModalVisible(true)}
          >
            <View style={[styles.myEmpty, { backgroundColor: c.surface }]}>
              <Ionicons name="add" size={26} color={c.textDim} />
            </View>
            <View style={styles.middle}>
              <Text style={[styles.name, { color: c.text, fontFamily: font.family }]}>My Status</Text>
              <Text style={[styles.time, { color: c.textDim }]}>Tap to add a status update</Text>
            </View>
          </TouchableOpacity>
        )}
        <Text style={[styles.section, { color: c.textDim }]}>Recent updates</Text>
        {groups.rest.map(([uid, items]) => renderRow(uid, items, false))}
        {groups.rest.length === 0 && !groups.mine && (
          <View style={styles.empty}>
            <Ionicons name="aperture-outline" size={48} color={c.textDim} />
            <Text style={[styles.emptyText, { color: c.textDim }]}>
              No statuses yet.{'\n'}Share what's on your mind — it lasts 24 hours!
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Post status modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>New Status</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="What's on your mind?"
              placeholderTextColor={c.textDim}
              multiline
              maxLength={300}
              style={[styles.input, { color: c.text, borderColor: c.divider, fontFamily: font.family }]}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalBtn} activeOpacity={0.7}>
                <Text style={[styles.modalBtnText, { color: c.textDim }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={post}
                disabled={!draft.trim() || posting}
                style={[styles.modalBtn, styles.postBtn, { backgroundColor: c.accent, opacity: draft.trim() && !posting ? 1 : 0.5 }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnText, { color: c.textOnAccent }]}>{posting ? 'Posting...' : 'Post'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status viewer modal */}
      <Modal visible={!!viewer} animationType="fade" transparent>
        <View style={styles.viewerWrap}>
          {viewer && viewer[viewerIdx] && (
            <View style={[styles.viewerCard, { backgroundColor: c.surface }]}>
              <View style={styles.viewerHeader}>
                <Avatar name={viewer[viewerIdx].userName} colors={c} size={40} />
                <View style={styles.middle}>
                  <Text style={[styles.name, { color: c.text, fontFamily: font.family }]}>
                    {viewer[viewerIdx].userName}
                  </Text>
                  <Text style={[styles.time, { color: c.textDim }]}>
                    {formatListTime(viewer[viewerIdx].createdAt)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setViewer(null)} style={styles.iconBtn} activeOpacity={0.7}>
                  <Ionicons name="close" size={24} color={c.text} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.viewerText, { color: c.text, fontFamily: font.family }]}>
                {viewer[viewerIdx].text}
              </Text>
              <View style={styles.viewerNav}>
                <TouchableOpacity
                  disabled={viewerIdx === 0}
                  onPress={() => setViewerIdx((i) => Math.max(0, i - 1))}
                  style={[styles.navBtn, { opacity: viewerIdx === 0 ? 0.3 : 1 }]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-back" size={26} color={c.text} />
                </TouchableOpacity>
                <Text style={[styles.navCount, { color: c.textDim }]}>
                  {viewerIdx + 1} / {viewer.length}
                </Text>
                <TouchableOpacity
                  disabled={viewerIdx === viewer.length - 1}
                  onPress={() => setViewerIdx((i) => Math.min(viewer.length - 1, i + 1))}
                  style={[styles.navBtn, { opacity: viewerIdx === viewer.length - 1 ? 0.3 : 1 }]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-forward" size={26} color={c.text} />
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  ring: { borderWidth: 2.5, borderRadius: 30, padding: 2 },
  myEmpty: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, marginLeft: 13 },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  time: { fontSize: 13 },
  section: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 14, lineHeight: 22 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, minHeight: 110, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  postBtn: { marginLeft: 8 },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
  viewerWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  viewerCard: { width: '100%', borderRadius: 18, padding: 18, minHeight: 280 },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconBtn: { padding: 6 },
  viewerText: { fontSize: 19, lineHeight: 28, flex: 1 },
  viewerNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  navBtn: { padding: 8 },
  navCount: { fontSize: 13 },
});
