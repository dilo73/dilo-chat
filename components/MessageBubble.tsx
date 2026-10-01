// ─── Message bubble: all message types ─────────────────────────────────────
// text, voice, image, video, document, location, contact, poll, sticker
// + reactions, reply quotes, edited tag, starred, view-once.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessage, MessageStatus } from '../lib/db';
import { formatTime } from '../lib/format';
import { Theme } from '../theme/themes';
import { FontOption } from '../theme/fonts';
import { VoicePlayer } from '../lib/voice';

export type DisplayStatus = MessageStatus | 'queued';

type BubbleMessage = Omit<ChatMessage, 'status'> & { status: DisplayStatus };

interface Props {
  message: BubbleMessage;
  isMine: boolean;
  theme: Theme;
  font: FontOption;
  singleTick: boolean;
  statusOverride?: DisplayStatus;
  senderName?: string;
  currentUid?: string;
  onReaction?: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: (forEveryone: boolean) => void;
  onForward?: () => void;
  onStar?: () => void;
  onTranslate?: () => void;
  onViewOnce?: () => void;
}

function Ticks({ status, singleTick, color, readColor }: {
  status: DisplayStatus; singleTick: boolean; color: string; readColor: string;
}) {
  if (status === 'queued') {
    return <Ionicons name="time-outline" size={15} color={color} style={styles.tick} />;
  }
  if (singleTick) {
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

const SPEEDS = [1, 1.5, 2];

function VoiceBubble({ message, isMine, theme }: { message: BubbleMessage; isMine: boolean; theme: Theme }) {
  const c = theme.colors;
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
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
        await playerRef.current.play(message.audioUrl, SPEEDS[speedIdx]);
      } catch { /* ignore */ }
    }
  };

  const cycleSpeed = async () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (playerRef.current && playing && message.audioUrl) {
      await playerRef.current.setSpeed(SPEEDS[next]);
    }
  };

  const barWidth = 110;
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
      <TouchableOpacity onPress={cycleSpeed} style={styles.speedBtn} activeOpacity={0.7}>
        <Text style={[styles.speedText, { color: c.accent }]}>{SPEEDS[speedIdx]}x</Text>
      </TouchableOpacity>
    </View>
  );
}

function MediaContent({ message, theme, onViewOnce }: { message: BubbleMessage; theme: Theme; onViewOnce?: () => void }) {
  const c = theme.colors;
  const type = message.type;

  // View-once: show placeholder until viewed
  if (message.viewOnce) {
    return (
      <TouchableOpacity onPress={onViewOnce} style={[styles.viewOnceBox, { backgroundColor: c.divider }]} activeOpacity={0.8}>
        <Ionicons name="eye-off-outline" size={28} color={c.textDim} />
        <Text style={[styles.viewOnceText, { color: c.textDim }]}>View once photo</Text>
      </TouchableOpacity>
    );
  }

  if (type === 'image' && message.mediaUrl) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => message.mediaUrl && Linking.openURL(message.mediaUrl)}>
        <Image source={{ uri: message.mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
      </TouchableOpacity>
    );
  }
  if (type === 'video' && message.mediaUrl) {
    return (
      <TouchableOpacity
        style={[styles.videoBox, { backgroundColor: '#000' }]}
        activeOpacity={0.8}
        onPress={() => message.mediaUrl && Linking.openURL(message.mediaUrl)}
      >
        <Ionicons name="play-circle" size={52} color="#fff" />
        <Text style={styles.videoLabel}>🎬 Video</Text>
      </TouchableOpacity>
    );
  }
  if (type === 'document' && message.mediaUrl) {
    const size = message.fileSize ? ` • ${(message.fileSize / 1024).toFixed(0)} KB` : '';
    return (
      <TouchableOpacity
        style={[styles.docBox, { backgroundColor: c.divider }]}
        activeOpacity={0.7}
        onPress={() => message.mediaUrl && Linking.openURL(message.mediaUrl)}
      >
        <Ionicons name="document-text" size={32} color={c.accent} />
        <View style={styles.docMeta}>
          <Text style={[styles.docName, { color: c.text }]} numberOfLines={1}>
            {message.fileName ?? 'Document'}{size}
          </Text>
          <Text style={[styles.docSub, { color: c.textDim }]}>Tap to open</Text>
        </View>
      </TouchableOpacity>
    );
  }
  if (type === 'location' && message.latitude != null) {
    const url = `https://www.google.com/maps?q=${message.latitude},${message.longitude}`;
    return (
      <TouchableOpacity style={[styles.locBox, { backgroundColor: c.divider }]} activeOpacity={0.7} onPress={() => Linking.openURL(url)}>
        <Ionicons name="location" size={32} color="#e53935" />
        <View style={styles.docMeta}>
          <Text style={[styles.docName, { color: c.text }]}>📍 Location</Text>
          <Text style={[styles.docSub, { color: c.accent }]}>Open in Maps</Text>
        </View>
      </TouchableOpacity>
    );
  }
  if (type === 'contact') {
    return (
      <View style={[styles.locBox, { backgroundColor: c.divider }]}>
        <Ionicons name="person-circle" size={40} color={c.accent} />
        <View style={styles.docMeta}>
          <Text style={[styles.docName, { color: c.text }]}>{message.contactName}</Text>
          <Text style={[styles.docSub, { color: c.textDim }]}>{message.contactPhone}</Text>
        </View>
      </View>
    );
  }
  if (type === 'sticker' && message.mediaUrl) {
    return <Text style={styles.sticker}>{message.mediaUrl}</Text>;
  }
  return null;
}

function PollContent({ message, theme, currentUid, chatId }: {
  message: BubbleMessage; theme: Theme; currentUid?: string; chatId: string;
}) {
  const c = theme.colors;
  const poll = message.poll;
  if (!poll) return null;
  const totalVotes = Object.values(poll.votes).reduce((a, b) => a + b.length, 0);
  return (
    <View style={styles.pollBox}>
      <Text style={[styles.pollQ, { color: c.text }]}>{poll.question}</Text>
      {poll.options.map((opt, i) => {
        const votes = poll.votes[String(i)] ?? [];
        const pct = totalVotes > 0 ? Math.round((votes.length / totalVotes) * 100) : 0;
        const mine = currentUid ? votes.includes(currentUid) : false;
        return (
          <TouchableOpacity
            key={i}
            style={[styles.pollOpt, { borderColor: mine ? c.accent : c.divider, backgroundColor: mine ? c.divider : 'transparent' }]}
            activeOpacity={0.7}
            onPress={() => {
              if (currentUid) {
                const { chatDb } = require('../lib/db');
                chatDb.votePoll(chatId, message.id, currentUid, i);
              }
            }}
          >
            <View style={[styles.pollBar, { width: `${pct}%`, backgroundColor: c.accent, opacity: 0.25 }]} />
            <Text style={[styles.pollOptText, { color: c.text }]} numberOfLines={1}>{opt}</Text>
            <Text style={[styles.pollPct, { color: c.textDim }]}>{pct}%</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={[styles.pollTotal, { color: c.textDim }]}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</Text>
    </View>
  );
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export function MessageBubble(props: Props) {
  const { message, isMine, theme, font, singleTick, statusOverride, senderName, currentUid } = props;
  const c = theme.colors;
  const status: DisplayStatus = statusOverride ?? message.status;
  const [showActions, setShowActions] = useState(false);

  if (message.deletedForEveryone) {
    return (
      <View style={[styles.wrapper, isMine ? styles.mine : styles.theirs]}>
        <View style={[styles.bubble, styles.deletedBubble, { backgroundColor: 'transparent' }]}>
          <Text style={[styles.deletedText, { color: c.textDim }]}>🚫 This message was deleted</Text>
        </View>
      </View>
    );
  }

  const isVoice = message.type === 'voice' && message.audioUrl;
  const isMedia = ['image', 'video', 'document', 'location', 'contact', 'sticker'].includes(message.type ?? '');
  const isPoll = message.type === 'poll' && message.poll;
  const reactions = message.reactions ?? {};
  const reactionKeys = Object.keys(reactions);
  const starred = currentUid && (message.starredBy ?? []).includes(currentUid);

  const handleLongPress = () => setShowActions(!showActions);

  return (
    <View style={[styles.wrapper, isMine ? styles.mine : styles.theirs]}>
      <TouchableOpacity
        activeOpacity={0.95}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={[
          styles.bubble,
          isMine
            ? { backgroundColor: c.bubbleOut, borderTopRightRadius: 4 }
            : { backgroundColor: c.bubbleIn, borderTopLeftRadius: 4 },
          message.type === 'sticker' && styles.stickerBubble,
        ]}
      >
        {senderName ? (
          <Text style={[styles.senderName, { color: c.accent }]} numberOfLines={1}>{senderName}</Text>
        ) : null}

        {message.replyTo && (
          <View style={[styles.replyBox, { borderLeftColor: c.accent, backgroundColor: c.divider }]}>
            <Text style={[styles.replyName, { color: c.accent }]} numberOfLines={1}>{message.replyTo.senderName}</Text>
            <Text style={[styles.replyText, { color: c.textDim }]} numberOfLines={2}>{message.replyTo.text}</Text>
          </View>
        )}

        {isVoice ? (
          <VoiceBubble message={message} isMine={isMine} theme={theme} />
        ) : isPoll ? (
          <PollContent message={message} theme={theme} currentUid={currentUid} chatId={message.chatId} />
        ) : isMedia ? (
          <>
            <MediaContent message={message} theme={theme} onViewOnce={props.onViewOnce} />
            {message.type !== 'sticker' && message.text && !message.text.startsWith('📷') && !message.text.startsWith('🎬') && !message.text.startsWith('📄') && !message.text.startsWith('📍') && !message.text.startsWith('👤') ? (
              <Text style={[styles.text, { color: c.text, fontFamily: font.family }]}>{message.text}</Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.text, { color: c.text, fontFamily: font.family }]}>
            {message.text}
            {message.edited && <Text style={[styles.edited, { color: c.textDim }]}> (edited)</Text>}
          </Text>
        )}

        {/* Reactions row */}
        {reactionKeys.length > 0 && (
          <View style={styles.reactionsRow}>
            {reactionKeys.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[styles.reactionChip, { backgroundColor: c.divider }]}
                onPress={() => props.onReaction?.(emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                <Text style={[styles.reactionCount, { color: c.textDim }]}>{reactions[emoji].length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.meta}>
          {starred && <Ionicons name="star" size={12} color="#f5a623" style={{ marginRight: 4 }} />}
          <Text style={[styles.time, { color: c.textDim }]}>{formatTime(message.createdAt)}</Text>
          {isMine && <Ticks status={status} singleTick={singleTick} color={c.textDim} readColor={c.tickRead} />}
        </View>

        {/* Long-press action menu */}
        {showActions && (
          <View style={[styles.actionMenu, { backgroundColor: c.surface, borderColor: c.divider }]}>
            <View style={styles.quickReactions}>
              {QUICK_REACTIONS.map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => { props.onReaction?.(emoji); setShowActions(false); }} style={styles.quickEmoji} activeOpacity={0.7}>
                  <Text style={styles.quickEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionRow}>
              {[
                { icon: 'arrow-undo-outline', label: 'Reply', fn: props.onReply },
                { icon: 'star-outline', label: starred ? 'Unstar' : 'Star', fn: props.onStar },
                { icon: 'language-outline', label: 'Translate', fn: props.onTranslate },
                { icon: 'arrow-redo-outline', label: 'Forward', fn: props.onForward },
              ].map((a) => a.fn ? (
                <TouchableOpacity key={a.label} style={styles.actionBtn} onPress={() => { a.fn!(); setShowActions(false); }} activeOpacity={0.7}>
                  <Ionicons name={a.icon as any} size={18} color={c.text} />
                  <Text style={[styles.actionLabel, { color: c.text }]}>{a.label}</Text>
                </TouchableOpacity>
              ) : null)}
              {isMine && props.onEdit ? (
                <TouchableOpacity style={styles.actionBtn} onPress={() => { props.onEdit!(); setShowActions(false); }} activeOpacity={0.7}>
                  <Ionicons name="pencil-outline" size={18} color={c.text} />
                  <Text style={[styles.actionLabel, { color: c.text }]}>Edit</Text>
                </TouchableOpacity>
              ) : null}
              {props.onDelete ? (
                <TouchableOpacity style={styles.actionBtn} onPress={() => { props.onDelete!(false); setShowActions(false); }} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={18} color="#ff5a5a" />
                  <Text style={[styles.actionLabel, { color: '#ff5a5a' }]}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', marginVertical: 3, paddingHorizontal: 12 },
  mine: { justifyContent: 'flex-end' },
  theirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 6 },
  stickerBubble: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  sticker: { fontSize: 64 },
  text: { fontSize: 15.5, lineHeight: 22 },
  edited: { fontSize: 11, fontStyle: 'italic' },
  senderName: { fontSize: 12.5, fontWeight: '700', marginBottom: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
  time: { fontSize: 11, marginRight: 4 },
  tick: { marginLeft: 1 },
  deletedBubble: { paddingVertical: 6 },
  deletedText: { fontSize: 13, fontStyle: 'italic' },
  // Voice
  voiceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, minWidth: 190 },
  playBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  voiceBarWrap: { marginLeft: 10 },
  voiceBarBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  voiceBarFill: { height: 4, borderRadius: 2 },
  voiceDur: { fontSize: 11, marginTop: 4 },
  speedBtn: { marginLeft: 8, paddingHorizontal: 6, paddingVertical: 4 },
  speedText: { fontSize: 12, fontWeight: '700' },
  // Reply
  replyBox: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 6 },
  replyName: { fontSize: 12, fontWeight: '700' },
  replyText: { fontSize: 13, marginTop: 1 },
  // Reactions
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4 },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, marginLeft: 4, fontWeight: '600' },
  // Media
  mediaImage: { width: 220, height: 160, borderRadius: 10, marginBottom: 4 },
  videoBox: { width: 220, height: 140, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  videoLabel: { color: '#fff', fontSize: 12, marginTop: 6 },
  docBox: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 4, minWidth: 200 },
  docMeta: { marginLeft: 10, flex: 1 },
  docName: { fontSize: 14, fontWeight: '600' },
  docSub: { fontSize: 12, marginTop: 2 },
  locBox: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 4, minWidth: 200 },
  viewOnceBox: { width: 200, height: 120, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  viewOnceText: { fontSize: 12, marginTop: 6 },
  // Poll
  pollBox: { minWidth: 220, paddingVertical: 4 },
  pollQ: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  pollOpt: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, overflow: 'hidden', position: 'relative', flexDirection: 'row', alignItems: 'center' },
  pollBar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8 },
  pollOptText: { fontSize: 14, flex: 1 },
  pollPct: { fontSize: 12, fontWeight: '700', marginLeft: 8 },
  pollTotal: { fontSize: 11, marginTop: 2 },
  // Action menu
  actionMenu: { borderWidth: 1, borderRadius: 12, marginTop: 8, padding: 8, minWidth: 220 },
  quickReactions: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  quickEmoji: { padding: 6 },
  quickEmojiText: { fontSize: 24 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 6 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, minWidth: '33%' },
  actionLabel: { fontSize: 12.5, marginLeft: 6 },
});
