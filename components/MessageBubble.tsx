// ─── Message bubble with ticks + voice messages ────────────────────────────
// singleTick=true  → your messages ALWAYS show one grey tick (privacy mode).
// 'queued'         → clock icon (waiting for App On / internet).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessage, MessageStatus } from '../lib/db';
import { formatTime } from '../lib/format';
import { Theme } from '../theme/themes';
import { FontOption } from '../theme/fonts';
import { VoicePlayer } from '../lib/voice';

export type DisplayStatus = MessageStatus | 'queued';

interface Props {
  message: Omit<ChatMessage, 'status'> & { status: DisplayStatus };
  isMine: boolean;
  theme: Theme;
  font: FontOption;
  singleTick: boolean;
  statusOverride?: DisplayStatus;
  senderName?: string;
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

function formatDur(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function VoiceBubble({ message, isMine, theme }: { message: ChatMessage; isMine: boolean; theme: Theme }) {
  const c = theme.colors;
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [elapsed, setElapsed] = useState(0);
  const playerRef = useRef<VoicePlayer | null>(null);
  const total = message.duration ?? 0;

  useEffect(() => () => { playerRef.current?.stop(); }, []);

  const toggle = async () => {
    if (!message.audioUrl) return;
    if (!playerRef.current) {
      playerRef.current = new VoicePlayer();
      playerRef.current.setOnUpdate((pos, dur, isPlaying) => {
        setProgress(dur > 0 ? pos / dur : 0);
        setElapsed(pos / 1000);
        setPlaying(isPlaying);
      });
    }
    if (playing) {
      await playerRef.current.pause();
      setPlaying(false);
    } else {
      try {
        await playerRef.current.play(message.audioUrl);
      } catch { /* ignore */ }
    }
  };

  const barWidth = 120;
  return (
    <View style={styles.voiceRow}>
      <TouchableOpacity onPress={toggle} style={[styles.playBtn, { backgroundColor: isMine ? c.accent : c.textDim }]} activeOpacity={0.7}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
      </TouchableOpacity>
      <View style={styles.voiceBarWrap}>
        <View style={[styles.voiceBarBg, { backgroundColor: c.divider, width: barWidth }]}>
          <View style={[styles.voiceBarFill, { backgroundColor: isMine ? c.accent : c.text, width: barWidth * progress }]} />
        </View>
        <Text style={[styles.voiceDur, { color: c.textDim }]}>
          {playing ? formatDur(elapsed) : formatDur(total)}
        </Text>
      </View>
      <Ionicons name="mic" size={16} color={c.textDim} style={{ marginLeft: 6 }} />
    </View>
  );
}

export function MessageBubble({ message, isMine, theme, font, singleTick, statusOverride, senderName }: Props) {
  const c = theme.colors;
  const status: DisplayStatus = statusOverride ?? message.status;
  const isVoice = message.type === 'voice' && message.audioUrl;
  return (
    <View style={[styles.wrapper, isMine ? styles.mine : styles.theirs]}>
      <View style={[
        styles.bubble,
        isMine
          ? { backgroundColor: c.bubbleOut, borderTopRightRadius: 4 }
          : { backgroundColor: c.bubbleIn, borderTopLeftRadius: 4 },
      ]}>
        {senderName ? (
          <Text style={[styles.senderName, { color: c.accent }]} numberOfLines={1}>{senderName}</Text>
        ) : null}
        {isVoice ? (
          <VoiceBubble message={message} isMine={isMine} theme={theme} />
        ) : (
          <Text style={[styles.text, { color: c.text, fontFamily: font.family }]}>
            {message.text}
          </Text>
        )}
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
  senderName: { fontSize: 12.5, fontWeight: '700', marginBottom: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
  time: { fontSize: 11, marginRight: 4 },
  tick: { marginLeft: 1 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, minWidth: 180 },
  playBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  voiceBarWrap: { marginLeft: 10 },
  voiceBarBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  voiceBarFill: { height: 4, borderRadius: 2 },
  voiceDur: { fontSize: 11, marginTop: 4 },
});
