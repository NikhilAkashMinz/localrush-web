// The partner's account: who is logged in, location, the server, how the work is paid, and log out.

import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ago, initials, phoneText, rupee } from '../format';
import { useNow } from '../hooks';
import { PAY_BASE, PAY_PER_KM } from '../pay';
import { useApp } from '../store';
import { color, type } from '../theme';
import { Button, Card, Icon, Line, Pill, SectionTitle, type IconName } from '../ui';
import { AreaSheet, LocationCard } from './LocationParts';
import ServerSheet from './ServerSheet';

export default function AccountScreen() {
  const { user, server, reachable, problem, syncedAt, live, logout } = useApp();
  const [serverOpen, setServerOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const now = useNow(5000);
  if (!user) return null;

  const confirmLogout = () =>
    Alert.alert(
      'Log out?',
      user.online ? 'You will go offline and stop getting deliveries.' : 'You can log in again with your mobile number.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => void logout() },
      ],
    );

  const serverSub =
    reachable === false
      ? (problem ?? 'Cannot reach it right now.')
      : live
        ? 'Live: changes arrive the moment they happen'
        : syncedAt
          ? `Connected · checked ${ago(syncedAt, now)}`
          : 'Connecting…';

  return (
    <ScrollView style={st.screen} contentContainerStyle={st.scroll}>
      <Card style={st.profile}>
        <View style={st.avatar}>
          <Text style={st.avatarText}>{initials(user.name)}</Text>
        </View>
        <View style={st.profileText}>
          <Text style={st.name}>{user.name}</Text>
          <Text style={st.phone}>{phoneText(user.phone)}</Text>
          <View style={st.pills}>
            <Pill text="Delivery partner" tone="teal" icon="moped" />
            <Pill text={user.online ? 'Online' : 'Offline'} tone={user.online ? 'green' : 'neutral'} dot={user.online ? color.green : color.faint} />
          </View>
        </View>
      </Card>

      <View style={st.spacer} />
      <LocationCard onChange={() => setAreaOpen(true)} />

      <SectionTitle title="Server" />
      <Card style={st.gap}>
        <Line icon={reachable === false ? 'lan-disconnect' : live ? 'access-point' : 'lan-connect'} label="LocalRush server" value={server || 'Not set'} sub={serverSub} />
        <Button title="Change server" kind="secondary" icon="pencil-outline" compact onPress={() => setServerOpen(true)} />
      </Card>

      <SectionTitle title="How it works" />
      <Card style={st.gap}>
        <Help icon="bell-ring-outline" text="While you are online and this app is open, packed orders within 6 km appear on the Deliveries tab the moment a shop packs them, and your phone buzzes." />
        <Help icon="access-point" text="LIVE at the top means this app, the website and the shop's app are in step: whatever happens in one shows up in the others at once." />
        <Help icon="wallet-outline" text={`Each delivery pays ${rupee(PAY_BASE)} plus ${rupee(PAY_PER_KM)} for every km you ride. The amount is fixed when you take it.`} />
        <Help icon="key-variant" text="At the door, the customer gives you a 4-digit code. The delivery is complete only with the right code." />
        <Help icon="cash" text="Cash you collect is the customer's payment for their order. Hand it over to LocalRush: it is not part of your earnings." />
        <Help icon="crosshairs-gps" text="With GPS on, the customer sees how far away you are while you bring their order. Your location is used only while you are online." />
      </Card>

      <Button title="Log out" kind="danger" icon="logout" onPress={confirmLogout} style={st.logout} />
      <Text style={st.version}>LocalRush Partner · version {Constants.expoConfig?.version ?? '1.0.0'}</Text>

      <AreaSheet visible={areaOpen} onClose={() => setAreaOpen(false)} />
      <ServerSheet visible={serverOpen} onClose={() => setServerOpen(false)} />
    </ScrollView>
  );
}

function Help({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={st.help}>
      <Icon name={icon} size={20} tint={color.teal} />
      <Text style={st.helpText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { padding: 16, paddingBottom: 32 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: color.deep, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: color.gold, fontSize: 22, fontWeight: '800' },
  profileText: { flex: 1, gap: 2 },
  name: { fontSize: type.title, fontWeight: '800', color: color.ink },
  phone: { fontSize: type.body, color: color.mute },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  gap: { gap: 14 },
  spacer: { height: 14 },
  help: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  helpText: { flex: 1, fontSize: 14.5, color: color.ink, lineHeight: 20 },
  logout: { marginTop: 24 },
  version: { textAlign: 'center', color: color.faint, fontSize: 12.5, marginTop: 14 },
});
