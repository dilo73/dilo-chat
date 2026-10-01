// ─── Contacts: everyone registered in the app ──────────────────────────────
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      {effectiveOffline && <OfflineBanner theme={theme} />}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.divider }]}>
        <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Contacts</Text>
        <Text style={[styles.subtitle, { color: c.textDim }]}>
          {users.length} {users.length === 1 ? 'person' : 'people'} on Dilo Chat
        </Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 12.5, marginTop: 2 },
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
});
