// ─── Main tab navigator ────────────────────────────────────────────────────
// Handles: online presence heartbeat, offline banner, auto-flush of the
// queued-message outbox when the app comes back online.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../theme/SettingsContext';
import { useAuth } from '../../lib/auth';
import { chatDb } from '../../lib/db';
import { getQueued, removeQueued } from '../../lib/queue';
import { useEffectiveOffline } from '../../lib/net';
import { registerPushToken, savePushToken } from '../../lib/notifications';

export default function TabsLayout() {
  const { theme } = useSettings();
  const { user } = useAuth();
  const c = theme.colors;
  const effectiveOffline = useEffectiveOffline();

  // Presence heartbeat
  useEffect(() => {
    if (!user) return;
    chatDb.setOnline(user.uid, true);
    const t = setInterval(() => chatDb.setOnline(user.uid, true), 60000);
    return () => {
      clearInterval(t);
      chatDb.setOnline(user.uid, false);
    };
  }, [user?.uid]);

  // Push token registration (best-effort, once per login)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const token = await registerPushToken();
      if (!cancelled && token) await savePushToken(user.uid, token);
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Flush queued messages when back online
  useEffect(() => {
    if (!user || effectiveOffline) return;
    let cancelled = false;
    (async () => {
      const queued = await getQueued();
      for (const m of queued) {
        if (cancelled) return;
        try {
          await chatDb.sendMessage(m.chatId, user.uid, m.text);
          await removeQueued(m.tempId);
        } catch { /* will retry next time */ }
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveOffline, user?.uid]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.divider },
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.textDim,
        }}
      >
        <Tabs.Screen
          name="chats"
          options={{
            title: 'Chats',
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="status"
          options={{
            title: 'Status',
            tabBarIcon: ({ color, size }) => <Ionicons name="aperture-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: 'Contacts',
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
