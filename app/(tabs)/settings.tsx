// ─── Settings: profile, VIP themes, fonts, privacy toggles ─────────────────
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';
import { themes } from '../../theme/themes';
import { fontOptions } from '../../theme/fonts';
import { Avatar } from '../../components/Avatar';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useEffectiveOffline } from '../../lib/net';
import { isConfigured } from '../../lib/firebase';

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

export default function SettingsScreen() {
  const { user, logout, updateName, demoMode } = useAuth();
  const {
    theme, themeId, setThemeId,
    font, fontId, setFontId,
    singleTick, setSingleTick,
    appOffline, setAppOffline,
  } = useSettings();
  const c = theme.colors;

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(user?.name ?? '');
  const effectiveOffline = useEffectiveOffline();

  const saveName = async () => {
    const n = draftName.trim();
    if (n.length < 2) { Alert.alert('Hmm', 'Name is too short.'); return; }
    await updateName(n);
    setEditingName(false);
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need your phone number to log back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile */}
        <Section title="PROFILE" colors={c}>
          <View style={styles.profileRow}>
            <Avatar name={user?.name ?? '?'} size={60} colors={c} />
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
            </View>
            <TouchableOpacity
              onPress={() => (editingName ? saveName() : setEditingName(true))}
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

        {/* VIP Themes */}
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

        {/* Stylish fonts */}
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

        {/* Privacy */}
        <Section title="PRIVACY" colors={c}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={[styles.toggleTitle, { color: c.text, fontFamily: font.family }]}>
                Always show single tick
              </Text>
              <Text style={[styles.toggleSub, { color: c.textDim }]}>
                Your messages always show one tick — nobody sees delivered/read.
              </Text>
            </View>
            <Switch
              value={singleTick}
              onValueChange={setSingleTick}
              trackColor={{ false: c.divider, true: c.accent }}
              thumbColor="#fff"
            />
          </View>
        </Section>

        {/* Offline mode */}
        <Section title="OFFLINE MODE" colors={c}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={[styles.toggleTitle, { color: c.text, fontFamily: font.family }]}>
                App Off
              </Text>
              <Text style={[styles.toggleSub, { color: c.textDim }]}>
                Stop syncing. Messages queue up and auto-send when you turn it back on.
              </Text>
            </View>
            <Switch
              value={appOffline}
              onValueChange={setAppOffline}
              trackColor={{ false: c.divider, true: c.accent }}
              thumbColor="#fff"
            />
          </View>
        </Section>

        {/* Logout */}
        <TouchableOpacity
          onPress={confirmLogout}
          style={[styles.logoutBtn, { backgroundColor: c.surface }]}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color={c.danger} />
          <Text style={[styles.logoutText, { color: c.danger }]}>Log out</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: c.textDim }]}>Dilo Chat v1.0 — VIP Edition</Text>
      </ScrollView>
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
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  profileMiddle: { flex: 1, marginLeft: 13 },
  profileName: { fontSize: 18, fontWeight: '700' },
  profilePhone: { fontSize: 13.5, marginTop: 2 },
  nameInput: { fontSize: 18, fontWeight: '700', borderBottomWidth: 1.5, paddingVertical: 2 },
  iconBtn: { padding: 8 },
  noteBox: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  noteText: { fontSize: 12.5, marginLeft: 8, flexShrink: 1, lineHeight: 18 },
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  toggleText: { flex: 1, marginRight: 12 },
  toggleTitle: { fontSize: 15.5, fontWeight: '600', marginBottom: 3 },
  toggleSub: { fontSize: 12.5, lineHeight: 18 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, marginBottom: 8,
  },
  logoutText: { fontSize: 16, fontWeight: '700', marginLeft: 8 },
  version: { fontSize: 12, textAlign: 'center', marginTop: 10 },
});
