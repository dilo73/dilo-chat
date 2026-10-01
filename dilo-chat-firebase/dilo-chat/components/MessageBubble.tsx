// ─── Message bubble with ticks ─────────────────────────────────────────────
// singleTick=true  → your messages ALWAYS show one grey tick (privacy mode).
// 'queued'         → clock icon (waiting for App On / internet).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessage, MessageStatus } from '../lib/db';
import { formatTime } from '../lib/format';
import { Theme } from '../theme/themes';
import { FontOption } from '../theme/fonts';

export type DisplayStatus = MessageStatus | 'queued';

interface Props {
  message: Omit<ChatMessage, 'status'> & { status: DisplayStatus };
  isMine: boolean;
  theme: Theme;
  font: FontOption;
  singleTick: boolean;
  statusOverride?: DisplayStatus;
}

function Ticks({ status, singleTick, color, readColor }: {
  status: DisplayStatus; singleTick: boolean; color: string; readColor: string;
}) {
  if (status === 'queued') {
    return <Ionicons name="time-outline" size={15} color={color} style={styles.tick} />;
  }
  if (singleTick) {
    // Privacy mode: never reveal delivered/read — always one tick.
    return <Ionicons name="checkmark" size={16} color={color} style={styles.tick} />;
  }
  if (status === 'sent') {
    return <Ionicons name="checkmark" size={16} color={color} style={styles.tick} />;
  }
  return (
    <Ionicons
      name="checkmark-done"
      size={16}
      color={status === 'read' ? readColor : color}
      style={styles.tick}
    />
  );
}

export function MessageBubble({ message, isMine, theme, font, singleTick, statusOverride }: Props) {
  const c = theme.colors;
  const status: DisplayStatus = statusOverride ?? message.status;
  return (
    <View style={[styles.wrapper, isMine ? styles.mine : styles.theirs]}>
      <View style={[
        styles.bubble,
        isMine
          ? { backgroundColor: c.bubbleOut, borderTopRightRadius: 4 }
          : { backgroundColor: c.bubbleIn, borderTopLeftRadius: 4 },
      ]}>
        <Text style={[styles.text, { color: c.text, fontFamily: font.family }]}>
          {message.text}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.time, { color: c.textDim }]}>{formatTime(message.createdAt)}</Text>
          {isMine && <Ticks status={status} singleTick={singleTick} color={c.textDim} readColor={c.tickRead} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', marginVertical: 3, paddingHorizontal: 12 },
  mine: { justifyContent: 'flex-end' },
  theirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 6 },
  text: { fontSize: 15.5, lineHeight: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
  time: { fontSize: 11, marginRight: 4 },
  tick: { marginLeft: 1 },
});
