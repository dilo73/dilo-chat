// ─── Broadcast: one message to many contacts ────────────────────────────────
// Route: /broadcast — pick contacts, type a message, send to each 1-on-1 chat.
import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { useSettings } from '../theme/SettingsContext';
import { chatDb, UserProfile } from '../lib/db';
import { Avatar } from '../components/Avatar';

export default function BroadcastScreen() {
  const { user } = useAuth();
  const { theme, font } = useSettings();
  const c = theme.colors;

  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    return chatDb.subscribeUsers((all) =>
      setContacts(all.filter((u) => u.uid !== user?.uid)));
  }, [user?.uid]);

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map((u) => u.uid)));
  };

  const send = async () => {
    const t = text.trim();
    if (!t || !user || selected.size === 0 || sending) return;
    setSending(true);
    const uids = [...selected];
    setProgress({ done: 0, total: uids.length });
    let ok = 0;
    for (const uid of uids) {
      try {
        const chatId = await chatDb.getOrCreateChat(user.uid, uid);
        await chatDb.sendMessage(chatId, user.uid, t);
        ok++;
      } catch { /* keep going */ }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setSending(false);
    setText('');
    setSelected(new Set());
    Alert.alert(
      'Broadcast sent 📢',
      `${ok} of ${uids.length} messages delivered.`,
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Broadcast</Text>
          <Text style={[styles.subtitle, { color: c.textDim }]}>
            {selected.size} of {contacts.length} selected
          </Text>
        </View>
        <TouchableOpacity onPress={toggleAll} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons
            name={selected.size === contacts.length && contacts.length > 0 ? 'checkbox' : 'square-outline'}
            size={24}
            color={c.accent}
          />
        </TouchableOpacity>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(u) => u.uid}
        renderItem={({ item }) => {
          const isSel = selected.has(item.uid);
          return (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: c.divider }]}
              onPress={() => toggle(item.uid)}
              activeOpacity={0.7}
            >
              <Avatar name={item.name} size={46} colors={c} />
              <View style={styles.middle}>
                <Text style={[styles.name, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.phone, { color: c.textDim }]} numberOfLines={1}>{item.phone}</Text>
              </View>
              <View style={[
                styles.checkbox,
                { borderColor: c.accent, backgroundColor: isSel ? c.accent : 'transparent' },
              ]}>
                {isSel && <Ionicons name="checkmark" size={17} color={c.textOnAccent} />}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="megaphone-outline" size={52} color={c.textDim} />
            <Text style={[styles.emptyText, { color: c.textDim }]}>
              No contacts yet.{'\n'}Ask friends to install Dilo Chat!
            </Text>
          </View>
        }
        contentContainerStyle={contacts.length === 0 ? { flex: 1 } : undefined}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.composer, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
          {sending && (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={c.accent} />
              <Text style={[styles.progressText, { color: c.textDim }]}>
                Sending {progress.done}/{progress.total}...
              </Text>
            </View>
          )}
          <View style={styles.inputRow}>
            <View style={[styles.inputWrap, { backgroundColor: c.inputBg }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Broadcast message..."
                placeholderTextColor={c.textDim}
                multiline
                editable={!sending}
                style={[styles.input, { color: c.text, fontFamily: font.family }]}
              />
            </View>
            <TouchableOpacity
              onPress={send}
              disabled={!text.trim() || selected.size === 0 || sending}
              style={[
                styles.sendBtn,
                { backgroundColor: c.accent, opacity: text.trim() && selected.size > 0 && !sending ? 1 : 0.45 },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons name="megaphone" size={21} color={c.textOnAccent} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 8 },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  iconBtn: { padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  middle: { flex: 1, marginLeft: 13 },
  name: { fontSize: 16.5, fontWeight: '600', marginBottom: 2 },
  phone: { fontSize: 13.5 },
  checkbox: { width: 27, height: 27, borderRadius: 13.5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 14, lineHeight: 22 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, paddingLeft: 4 },
  progressText: { fontSize: 13, marginLeft: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  inputWrap: { flex: 1, borderRadius: 22, paddingLeft: 16, paddingRight: 10, paddingVertical: 4, marginRight: 8 },
  input: { fontSize: 15.5, maxHeight: 110, paddingVertical: 8 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
