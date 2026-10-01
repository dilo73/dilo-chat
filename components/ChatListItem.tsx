// ─── WhatsApp-style chat list row ──────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { Chat } from '../lib/db';
import { formatListTime } from '../lib/format';
import { Theme } from '../theme/themes';
import { FontOption } from '../theme/fonts';

interface Props {
  chat: Chat;
  currentUid: string;
  theme: Theme;
  font: FontOption;
  onPress: () => void;
  onLongPress?: () => void;
}

export function ChatListItem({ chat, currentUid, theme, font, onPress, onLongPress }: Props) {
  const c = theme.colors;
  const isGroup = !!chat.isGroup;
  const otherUid = chat.participants.find((p) => p !== currentUid) ?? currentUid;
  const name = isGroup ? (chat.groupName ?? 'Group') : (chat.names[otherUid] ?? 'Unknown');
  const unread = chat.unread[currentUid] ?? 0;
  const isMuted = !!chat.muted?.[currentUid];
  const isPinned = !!chat.pinned;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      style={[styles.row, { borderBottomColor: c.divider }]}
      activeOpacity={0.7}
    >
      {isGroup ? (
        <View style={[styles.groupIcon, { backgroundColor: c.accent }]}>
          <Text style={styles.groupEmoji}>👥</Text>
        </View>
      ) : (
        <Avatar name={name} colors={c} />
      )}
      <View style={styles.middle}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
            {name}
          </Text>
          {isMuted && <Text style={styles.muteIcon}>🔕</Text>}
        </View>
        <Text style={[styles.preview, { color: unread > 0 ? c.text : c.textDim, fontFamily: font.family }]} numberOfLines={1}>
          {chat.lastMessage || 'Say salaam! Start the conversation 👋'}
        </Text>
      </View>
      <View style={styles.right}>
        <View style={styles.timeRow}>
          <Text style={[styles.time, { color: unread > 0 ? c.badge : c.textDim }]}>
            {chat.lastMessageAt ? formatListTime(chat.lastMessageAt) : ''}
          </Text>
          {isPinned && <Ionicons name="pin" size={14} color={c.textDim} style={{ marginLeft: 4 }} />}
        </View>
        {unread > 0 && (
          <View style={[styles.badge, { backgroundColor: c.badge }]}>
            <Text style={[styles.badgeText, { color: c.textOnAccent }]}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  middle: { flex: 1, marginLeft: 13, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  name: { fontSize: 16.5, fontWeight: '600', flexShrink: 1 },
  muteIcon: { fontSize: 13, marginLeft: 6 },
  preview: { fontSize: 14 },
  right: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  time: { fontSize: 12 },
  badge: { minWidth: 21, height: 21, borderRadius: 10.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  groupIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  groupEmoji: { fontSize: 24 },
});
