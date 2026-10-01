// ─── Settings: profile, privacy, security, VIP themes, fonts ───────────────
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  Switch, TextInput, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { themes } from '../../theme/themes';
import { fontOptions } from '../../theme/fonts';
import { Avatar } from '../../components/Avatar';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useEffectiveOffline } from '../../lib/net';
import { isConfigured } from '../../lib/firebase';
import { chatDb, UserProfile } from '../../lib/db';
import { pickImage, uploadMedia } from '../../lib/media';
import Constants from 'expo-constants';

/** AsyncStorage key for the app-lock toggle (read by app/_layout.tsx too). */
export const APP_LOCK_KEY = 'app_lock_enabled';

function Section({ title, colors, children }: {
  title: string; colors: any; children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textDim }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {children}
      </View>
    </View>
  );
}

function Row({ icon, title, sub, colors, onPress, right }: {
  icon: string; title: string; sub?: string; colors: any;
  onPress?: () => void; right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.background }]}>
        <Ionicons name={icon as any} size={20} color={colors.accent} />
      </View>
      <View style={styles.rowMiddle}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.textDim }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textDim} /> : null)}
    </TouchableOpacity>
  );
}

function ToggleRow({ title, sub, value, onChange, colors }: {
  title: string; sub?: string; value: boolean;
  onChange: (v: boolean) => void; colors: any;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleTitle, { color: colors.text }]}>{title}</Text>
        {sub ? <Text style={[styles.toggleSub, { color: colors.textDim }]}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.divider, true: colors.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { user, logout, updateName, demoMode } = useAuth();
  const {
    theme, themeId, setThemeId,
    font, fontId, setFontId,
    singleTick, setSingleTick,
    appOffline, setAppOffline,
  } = useSettings();
  const c = theme.colors;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(user?.name ?? '');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [bdayModal, setBdayModal] = useState(false);
  const [bdayDraft, setBdayDraft] = useState('');
  const [lockOn, setLockOn] = useState(false);
  const [blockedNames, setBlockedNames] = useState<Record<string, string>>({});
  const effectiveOffline = useEffectiveOffline();

  // Live profile (photo, birthday, privacy flags, blocked list).
  useEffect(() => {
    if (!user) return;
    return chatDb.subscribeUsers((all) => {
      setProfile(all.find((u) => u.uid === user.uid) ?? null);
    });
  }, [user?.uid]);

  // App-lock flag.
  useEffect(() => {
    AsyncStorage.getItem(APP_LOCK_KEY).then((v) => setLockOn(v === '1'));
  }, []);

  // Resolve blocked users' names.
  useEffect(() => {
    const ids = profile?.blockedUsers ?? [];
    if (ids.length === 0) { setBlockedNames({}); return; }
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const id of ids) {
        const u = await chatDb.getUser(id);
        out[id] = u?.name ?? u?.phone ?? 'Unknown';
      }
      if (!cancelled) setBlockedNames(out);
    })();
    return () => { cancelled = true; };
  }, [JSON.stringify(profile?.blockedUsers ?? [])]);

  // ── Profile photo ──────────────────────────────────────────────────────
  const changePhoto = async () => {
    if (!user || photoBusy) return;
    const picked = await pickImage();
    if (!picked) return;
    setPhotoBusy(true);
    try {
      const url = await uploadMedia('profile_pics', picked.uri, `profile_${user.uid}.jpg`);
      if (!url) throw new Error('upload failed');
      await chatDb.updatePhoto(user.uid, url);
    } catch {
      Alert.alert('Photo', 'Profile photo upload nahi ho saki.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveName = async () => {
    const n = draftName.trim();
    if (n.length < 2) { Alert.alert('Hmm', 'Name is too short.'); return; }
    await updateName(n);
    setEditingName(false);
  };

  // ── Birthday ───────────────────────────────────────────────────────────
  const saveBirthday = async () => {
    const v = bdayDraft.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      Alert.alert('Birthday', 'Format: YYYY-MM-DD (masalan 1995-03-21)');
      return;
    }
    const d = new Date(v + 'T00:00:00');
    if (isNaN(d.getTime()) || d > new Date()) {
      Alert.alert('Birthday', 'Sahi tareekh likho.');
      return;
    }
    if (!user) return;
    try {
      await chatDb.updateProfile(user.uid, { birthday: v });
      setBdayModal(false);
    } catch {
      Alert.alert('Error', 'Birthday save nahi ho saki.');
    }
  };

  // ── App lock ───────────────────────────────────────────────────────────
  const toggleLock = async (on: boolean) => {
    if (on) {
      const hasHw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      if (!hasHw || !enrolled) {
        Alert.alert(
          'App Lock',
          'Is phone par fingerprint/face lock set nahi hai. Pehle phone ki Settings mein screen lock lagao.',
        );
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm to enable App Lock',
      });
      if (!res.success) return;
      await AsyncStorage.setItem(APP_LOCK_KEY, '1');
      setLockOn(true);
    } else {
      await AsyncStorage.setItem(APP_LOCK_KEY, '0');
      setLockOn(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need your phone number to log back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  const unblock = (blockedUid: string, name: string) => {
    if (!user) return;
    Alert.alert('Unblock?', `${name} ko unblock karna hai?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock', onPress: async () => {
          try { await chatDb.unblockUser(user.uid, blockedUid); }
          catch { Alert.alert('Error', 'Unblock nahi ho saka.'); }
        },
      },
    ]);
  };

  const photoUrl = profile?.photoUrl;
  const birthday = profile?.birthday;
  const blockedIds = profile?.blockedUsers ?? [];
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Profile ─────────────────────────────────────────────────── */}
        <Section title="PROFILE" colors={c}>
          <View style={styles.profileRow}>
            <TouchableOpacity onPress={changePhoto} activeOpacity={0.8} style={styles.photoWrap}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photo} />
              ) : (
                <Avatar name={user?.name ?? '?'} size={64} colors={c} />
              )}
              <View style={[styles.cameraBadge, { backgroundColor: c.accent }]}>
                {photoBusy
                  ? <ActivityIndicator size="small" color={c.textOnAccent} />
                  : <Ionicons name="camera" size={14} color={c.textOnAccent} />}
              </View>
            </TouchableOpacity>
            <View style={styles.profileMiddle}>
              {editingName ? (
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                  style={[styles.nameInput, { color: c.text, borderColor: c.accent, fontFamily: font.family }]}
                  onSubmitEditing={saveName}
                />
              ) : (
                <Text style={[styles.profileName, { color: c.text, fontFamily: font.family }]}>
                  {user?.name}
                </Text>
              )}
              <Text style={[styles.profilePhone, { color: c.textDim }]}>{user?.phone}</Text>
              {birthday ? (
                <Text style={[styles.profilePhone, { color: c.textDim }]}>🎂 {birthday}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => {
                if (editingName) saveName();
                else { setDraftName(user?.name ?? ''); setEditingName(true); }
              }}
              style={styles.iconBtn}
            >
              <Ionicons
                name={editingName ? 'checkmark-outline' : 'pencil-outline'}
                size={20} color={c.accent}
              />
            </TouchableOpacity>
          </View>
          {!isConfigured && (
            <View style={[styles.noteBox, { borderTopColor: c.divider }]}>
              <Ionicons name="flask-outline" size={15} color={c.accent} />
              <Text style={[styles.noteText, { color: c.textDim }]}>
                Demo mode — paste Firebase keys (see SETUP.md) for real accounts & messaging.
              </Text>
            </View>
          )}
          {demoMode && isConfigured && (
            <View style={[styles.noteBox, { borderTopColor: c.divider }]}>
              <Ionicons name="flask-outline" size={15} color={c.accent} />
              <Text style={[styles.noteText, { color: c.textDim }]}>
                Logged in with a demo session.
              </Text>
            </View>
          )}
        </Section>

        {/* ── Account extras ──────────────────────────────────────────── */}
        <Section title="ACCOUNT" colors={c}>
          <Row
            icon="gift-outline" title="Birthday" colors={c}
            sub={birthday ?? 'Apni birthday set karo'}
            onPress={() => { setBdayDraft(birthday ?? ''); setBdayModal(true); }}
          />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <Row
            icon="star-outline" title="Starred messages" colors={c}
            sub="Save ki hui zaroori messages"
            onPress={() => router.push('/starred')}
          />
        </Section>

        {/* ── Security ────────────────────────────────────────────────── */}
        <Section title="SECURITY" colors={c}>
          <ToggleRow
            title="App Lock 🔒"
            sub="App kholne par fingerprint / face lock mange"
            value={lockOn}
            onChange={toggleLock}
            colors={c}
          />
        </Section>

        {/* ── Privacy ─────────────────────────────────────────────────── */}
        <Section title="PRIVACY" colors={c}>
          <ToggleRow
            title="Always show single tick"
            sub="Your messages always show one tick — nobody sees delivered/read."
            value={singleTick}
            onChange={setSingleTick}
            colors={c}
          />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <ToggleRow
            title="Hide last seen"
            sub="Logon ko tumhara 'last seen' nazar nahi ayega."
            value={!!profile?.hideLastSeen}
            onChange={(v) => user && chatDb.updateProfile(user.uid, { hideLastSeen: v }).catch(() => {})}
            colors={c}
          />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <ToggleRow
            title="Hide online status"
            sub="Tum online ho ya nahi — koi nahi dekh sakega."
            value={!!profile?.hideOnline}
            onChange={(v) => user && chatDb.updateProfile(user.uid, { hideOnline: v }).catch(() => {})}
            colors={c}
          />
        </Section>

        {/* ── Blocked users ───────────────────────────────────────────── */}
        {blockedIds.length > 0 && (
          <Section title="BLOCKED USERS" colors={c}>
            {blockedIds.map((id, i) => (
              <View key={id}>
                <View style={styles.blockRow}>
                  <Avatar name={blockedNames[id] ?? '?'} size={40} colors={c} />
                  <Text style={[styles.blockName, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                    {blockedNames[id] ?? 'Loading...'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => unblock(id, blockedNames[id] ?? 'Unknown')}
                    style={[styles.unblockBtn, { borderColor: c.accent }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.unblockText, { color: c.accent }]}>Unblock</Text>
                  </TouchableOpacity>
                </View>
                {i < blockedIds.length - 1 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
              </View>
            ))}
          </Section>
        )}

        {/* ── VIP Themes ──────────────────────────────────────────────── */}
        <Section title="VIP THEMES" colors={c}>
          <View style={styles.themeGrid}>
            {themes.map((t) => {
              const selected = t.id === themeId;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setThemeId(t.id)}
                  style={[
                    styles.themeTile,
                    { backgroundColor: t.colors.chatBg, borderColor: selected ? t.colors.accent : c.divider },
                    selected && { borderWidth: 2.5 },
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={styles.themeBubbles}>
                    <View style={[styles.miniBubble, { backgroundColor: t.colors.bubbleIn }]} />
                    <View style={[styles.miniBubble, styles.miniOut, { backgroundColor: t.colors.bubbleOut }]} />
                  </View>
                  <Text style={[styles.themeName, { color: t.colors.text }]} numberOfLines={1}>
                    {t.name}
                  </Text>
                  {selected && (
                    <View style={[styles.check, { backgroundColor: t.colors.accent }]}>
                      <Ionicons name="checkmark" size={13} color={t.colors.textOnAccent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: c.textDim }]}>
            {theme.name} — {theme.tagline}
          </Text>
        </Section>

        {/* ── Stylish fonts ───────────────────────────────────────────── */}
        <Section title="CHAT FONT" colors={c}>
          {fontOptions.map((f, i) => {
            const selected = f.id === fontId;
            return (
              <TouchableOpacity
                key={f.id}
                onPress={() => setFontId(f.id)}
                style={[
                  styles.fontRow,
                  i < fontOptions.length - 1 && { borderBottomColor: c.divider, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.fontPreview, { color: c.text, fontFamily: f.family }]}>
                  {f.label}
                </Text>
                <Text style={[styles.fontSample, { color: c.textDim, fontFamily: f.family }]}>
                  Salaam! 👋
                </Text>
                {selected && <Ionicons name="checkmark-circle" size={22} color={c.accent} />}
              </TouchableOpacity>
            );
          })}
        </Section>

        {/* ── Offline mode ────────────────────────────────────────────── */}
        <Section title="OFFLINE MODE" colors={c}>
          <ToggleRow
            title="App Off"
            sub="Stop syncing. Messages queue up and auto-send when you turn it back on."
            value={appOffline}
            onChange={setAppOffline}
            colors={c}
          />
        </Section>

        {/* ── Logout ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={confirmLogout}
          style={[styles.logoutBtn, { backgroundColor: c.surface }]}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color={c.danger} />
          <Text style={[styles.logoutText, { color: c.danger }]}>Log out</Text>
        </TouchableOpacity>

        {/* ── About ───────────────────────────────────────────────────── */}
        <View style={styles.about}>
          <Text style={[styles.aboutTitle, { color: c.text, fontFamily: font.family }]}>
            Dilo Chat v{appVersion}
          </Text>
          <Text style={[styles.aboutSub, { color: c.textDim }]}>
            Made with ❤️ — VIP Edition ✨
          </Text>
        </View>
      </ScrollView>

      {/* ── Birthday modal ────────────────────────────────────────────── */}
      <Modal visible={bdayModal} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text, fontFamily: font.family }]}>
              🎂 Birthday
            </Text>
            <TextInput
              value={bdayDraft}
              onChangeText={setBdayDraft}
              placeholder="YYYY-MM-DD (masalan 1995-03-21)"
              placeholderTextColor={c.textDim}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              style={[styles.input, { color: c.text, borderColor: c.divider, fontFamily: font.family }]}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setBdayModal(false)} style={styles.modalBtn} activeOpacity={0.7}>
                <Text style={[styles.modalBtnText, { color: c.textDim }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveBirthday}
                style={[styles.modalBtn, styles.postBtn, { backgroundColor: c.accent }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnText, { color: c.textOnAccent }]}>Save</Text>
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
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22, fontWeight: '700' },
  scroll: { padding: 14, paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 14, padding: 14, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  photoWrap: { position: 'relative' },
  photo: { width: 64, height: 64, borderRadius: 32 },
  cameraBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 24, height: 24,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  profileMiddle: { flex: 1, marginLeft: 13 },
  profileName: { fontSize: 18, fontWeight: '700' },
  profilePhone: { fontSize: 13.5, marginTop: 2 },
  nameInput: { fontSize: 18, fontWeight: '700', borderBottomWidth: 1.5, paddingVertical: 2 },
  iconBtn: { padding: 8 },
  noteBox: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  noteText: { fontSize: 12.5, marginLeft: 8, flexShrink: 1, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowMiddle: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 15.5, fontWeight: '600', marginBottom: 2 },
  rowSub: { fontSize: 12.5, lineHeight: 17 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  toggleText: { flex: 1, marginRight: 12 },
  toggleTitle: { fontSize: 15.5, fontWeight: '600', marginBottom: 3 },
  toggleSub: { fontSize: 12.5, lineHeight: 18 },
  blockRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  blockName: { flex: 1, fontSize: 15.5, fontWeight: '600', marginLeft: 12 },
  unblockBtn: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  unblockText: { fontSize: 13, fontWeight: '700' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  themeTile: {
    width: '31.5%', aspectRatio: 0.82, borderRadius: 12, borderWidth: 1,
    padding: 8, marginBottom: 10, justifyContent: 'space-between',
  },
  themeBubbles: { flex: 1, justifyContent: 'center' },
  miniBubble: { height: 12, borderRadius: 6, width: '75%', marginBottom: 6 },
  miniOut: { alignSelf: 'flex-end' },
  themeName: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  check: {
    position: 'absolute', top: 5, right: 5, width: 20, height: 20,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  hint: { fontSize: 12.5, textAlign: 'center', marginTop: 2 },
  fontRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  fontPreview: { fontSize: 16.5, fontWeight: '600', flex: 1 },
  fontSample: { fontSize: 14, marginRight: 10 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, marginBottom: 8,
  },
  logoutText: { fontSize: 16, fontWeight: '700', marginLeft: 8 },
  about: { alignItems: 'center', marginTop: 14 },
  aboutTitle: { fontSize: 15, fontWeight: '700' },
  aboutSub: { fontSize: 12.5, marginTop: 4 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  postBtn: { marginLeft: 8 },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
});
