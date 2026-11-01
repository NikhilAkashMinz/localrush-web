// The shop and the owner's account: shop details and hours, pausing orders, the server, how
// LocalRush works for a shop, and log out.

import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api';
import { hoursText, KIND_LABEL, withinHours } from '../catalog';
import { ago, phoneText } from '../format';
import { useNow } from '../hooks';
import { useApp } from '../store';
import { color, type } from '../theme';
import { Button, Card, Icon, Line, Pill, SectionTitle, type IconName } from '../ui';
import ServerSheet from './ServerSheet';

export default function ShopScreen() {
  const { user, shop, server, reachable, problem, syncedAt, live, logout, setPaused, notify } = useApp();
  const [serverOpen, setServerOpen] = useState(false);
  const [pausing, setPausing] = useState(false);
  const now = useNow(5000);
  if (!user) return null;

  const confirmLogout = () =>
    Alert.alert('Log out?', 'New orders will not buzz this phone until you log in again. Your shop stays open to customers.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ]);

  const togglePause = async () => {
    if (!shop) return;
    setPausing(true);
    try {
      await setPaused(!shop.paused);
      notify(
        shop.paused
          ? { tone: 'good', title: 'You are taking orders again' }
          : { tone: 'info', title: 'Shop paused', body: 'Customers cannot order from you until you switch it back on.' },
      );
    } catch (e) {
      notify({ tone: 'bad', title: errorText(e) });
    }
    setPausing(false);
  };

  const serverSub =
    reachable === false
      ? (problem ?? 'Cannot reach it right now.')
      : live
        ? 'Live: changes arrive the moment they happen'
        : syncedAt
          ? `Connected · checked ${ago(syncedAt, now)}`
          : 'Connecting…';
  const openNow = shop ? withinHours(shop, now) : false;

  return (
    <ScrollView style={st.screen} contentContainerStyle={st.scroll}>
      <Card style={st.profile}>
        <View style={st.avatar}>
          <Icon name="storefront" size={32} tint={color.gold} />
        </View>
        <View style={st.profileText}>
          <Text style={st.name}>{shop?.name ?? user.name}</Text>
          <Text style={st.sub}>{shop ? `${KIND_LABEL[shop.kind] ?? 'Shop'} · ${shop.area}` : 'Loading your shop…'}</Text>
          <View style={st.pills}>
            {shop ? <Pill text={`${shop.rating.toFixed(1)} rating`} tone="gold" icon="star" /> : null}
            <Pill
              text={shop?.paused ? 'Paused' : 'Taking orders'}
              tone={shop?.paused ? 'neutral' : 'green'}
              dot={shop?.paused ? color.faint : color.green}
            />
          </View>
        </View>
      </Card>

      <SectionTitle title="Your shop" />
      <Card style={st.gap}>
        <Line icon="account-outline" label="Owner's login" value={phoneText(user.phone)} />
        {shop ? (
          <Line
            icon="clock-outline"
            label="Opening hours"
            value={hoursText(shop)}
            sub={`Indian time · ${openNow ? 'open now' : 'closed now'}${shop.paused ? ', and paused' : ''}`}
          />
        ) : null}
        <Button
          title={shop?.paused ? 'Take orders again' : 'Pause new orders'}
          kind={shop?.paused ? 'primary' : 'secondary'}
          icon={shop?.paused ? 'play-circle-outline' : 'pause-circle-outline'}
          compact
          onPress={() => void togglePause()}
          busy={pausing}
          disabled={!shop}
        />
      </Card>

      <SectionTitle title="Server" />
      <Card style={st.gap}>
        <Line icon={reachable === false ? 'lan-disconnect' : live ? 'access-point' : 'lan-connect'} label="LocalRush server" value={server || 'Not set'} sub={serverSub} />
        <Button title="Change server" kind="secondary" icon="pencil-outline" compact onPress={() => setServerOpen(true)} />
      </Card>

      <SectionTitle title="How it works" />
      <Card style={st.gap}>
        <Help icon="bell-ring-outline" text="While this app is open, new orders appear on the Orders tab the moment customers place them, and your phone buzzes." />
        <Help icon="access-point" text="LIVE at the top means this app, the website and the delivery partner app are in step: whatever happens in one shows up in the others at once." />
        <Help icon="check-circle-outline" text="Accept an order, pack it, then tap Packed and ready. Delivery partners nearby are told at once, and one comes to collect it." />
        <Help icon="package-variant-closed" text="Stock goes down by itself as customers order, and back up if an order is cancelled. Change it any time on the Products tab." />
        <Help icon="cash" text="For cash on delivery, the delivery partner collects the money at the customer's door." />
        <Help icon="pause-circle-outline" text="Too busy? Pause new orders. Customers cannot order from you until you switch it back on." />
      </Card>

      <Button title="Log out" kind="danger" icon="logout" onPress={confirmLogout} style={st.logout} />
      <Text style={st.version}>LocalRush Vendor · version {Constants.expoConfig?.version ?? '1.0.0'}</Text>

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
  profileText: { flex: 1, gap: 2 },
  name: { fontSize: type.title, fontWeight: '800', color: color.ink },
  sub: { fontSize: type.body - 1, color: color.mute },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  gap: { gap: 14 },
  help: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  helpText: { flex: 1, fontSize: 14.5, color: color.ink, lineHeight: 20 },
  logout: { marginTop: 24 },
  version: { textAlign: 'center', color: color.faint, fontSize: 12.5, marginTop: 14 },
});
