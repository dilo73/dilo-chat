// ─── WhatsApp-style chat list row ──────────────────────────────────────────
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
}

export function ChatListItem({ chat, currentUid, theme, font, onPress }: Props) {
  const c = theme.colors;
  const isGroup = !!chat.isGroup;
  const otherUid = chat.participants.find((p) => p !== currentUid) ?? currentUid;
  const name = isGroup ? (chat.groupName ?? 'Group') : (chat.names[otherUid] ?? 'Unknown');
  const unread = chat.unread[currentUid] ?? 0;

  return (
    <TouchableOpacity onPress={onPress} style={[styles.row, { borderBottomColor: c.divider }]} activeOpacity={0.7}>
      {isGroup ? (
        <View style={[styles.groupIcon, { backgroundColor: c.accent }]}>
          <Text style={styles.groupEmoji}>👥</Text>
        </View>
      ) : (
        <Avatar name={name} colors={c} />
      )}
      <View style={styles.middle}>
        <Text style={[styles.name, { color: c.text, fontFamily: font.family }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.preview, { color: unread > 0 ? c.text : c.textDim, fontFamily: font.family }]} numberOfLines={1}>
          {chat.lastMessage || 'Say salaam! Start the conversation 👋'}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.time, { color: unread > 0 ? c.badge : c.textDim }]}>
          {chat.lastMessageAt ? formatListTime(chat.lastMessageAt) : ''}
        </Text>
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
  name: { fontSize: 16.5, fontWeight: '600', marginBottom: 3 },
  preview: { fontSize: 14 },
  right: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8 },
  time: { fontSize: 12, marginBottom: 5 },
  badge: { minWidth: 21, height: 21, borderRadius: 10.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  groupIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  groupEmoji: { fontSize: 24 },
});
