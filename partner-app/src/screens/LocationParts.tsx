// Where the partner is: the phone's GPS (the default), or an area chosen from a list.

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api';
import { ago } from '../format';
import { useNow } from '../hooks';
import { PLACES } from '../places';
import { useApp } from '../store';
import { color, type } from '../theme';
import type { Place } from '../types';
import { Card, Icon, Sheet, type IconName } from '../ui';

/** One line saying where the partner is being placed, and why, with a button to change it. */
export function LocationCard({ onChange }: { onChange: () => void }) {
  const { user, gpsWanted, gps, fix } = useApp();
  const now = useNow(5000);
  if (!user) return null;
  const area = user.place?.label ?? 'not set';
  const problem = gpsProblem(gpsWanted, user.online, gps);
  let icon: IconName = 'map-marker-outline';
  let title = `Area: ${area}`;
  let sub = 'Deliveries are found near this area.';

  if (gpsWanted && !user.online) {
    icon = 'crosshairs-gps';
    title = 'GPS, while you are online';
    sub = 'Your location is used only while you are online.';
  } else if (gpsWanted) {
    switch (gps) {
      case 'on':
        icon = 'crosshairs-gps';
        title = 'Sharing your GPS location';
        sub = fix ? `Updated ${ago(fix.at, now)}${fix.accuracy ? `, accurate to ${Math.round(fix.accuracy)} m` : ''}` : 'Finding you…';
        break;
      case 'starting':
        icon = 'crosshairs';
        title = 'Finding your location…';
        sub = 'Allow location access if your phone asks.';
        break;
      case 'denied':
        icon = 'crosshairs-question';
        title = 'Location permission is off';
        sub = `Using the area ${area}. Allow location for this app in your phone's settings, or choose an area.`;
        break;
      case 'disabled':
        icon = 'crosshairs-question';
        title = 'Location is turned off on the phone';
        sub = `Using the area ${area}. Turn location on, or choose an area.`;
        break;
      case 'error':
        icon = 'crosshairs-question';
        title = 'Could not read your location';
        sub = `Using the area ${area} for now.`;
        break;
      default:
        icon = 'crosshairs-gps';
        title = 'GPS';
        sub = 'Starting…';
    }
  }

  return (
    <Card style={st.card}>
      <View style={st.head}>
        <Text style={st.label}>Your location</Text>
        <Pressable onPress={onChange} hitSlop={12} accessibilityRole="button" accessibilityLabel="Change" style={({ pressed }) => pressed && st.pressed}>
          <Text style={st.change}>Change</Text>
        </Pressable>
      </View>
      <View style={st.row}>
        <View style={[st.icon, problem && st.iconProblem]}>
          <Icon name={icon} size={20} tint={problem ? color.red : color.teal} />
        </View>
        <View style={st.text}>
          <Text style={st.title}>{title}</Text>
          <Text style={st.sub}>{sub}</Text>
        </View>
      </View>
    </Card>
  );
}

/** True when GPS was wanted but cannot be used, so the partner should look at the location card. */
export const gpsProblem = (gpsWanted: boolean, online: boolean | undefined, gps: string) =>
  gpsWanted && !!online && (gps === 'denied' || gps === 'disabled' || gps === 'error');

/** Choose between the phone's GPS and an area from the list. */
export function AreaSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, gpsWanted, chooseArea, shareGps, notify } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (p: Place) => {
    setBusy(p.label);
    try {
      await chooseArea(p);
      notify({ tone: 'info', title: `Area set to ${p.label}`, body: 'Deliveries near this area will be shown.' });
      onClose();
    } catch (e) {
      notify({ tone: 'bad', title: errorText(e) });
    }
    setBusy(null);
  };

  const gpsOn = async () => {
    await shareGps();
    onClose();
  };

  return (
    <Sheet visible={visible} title="Where are you?" onClose={onClose}>
      <Pressable onPress={gpsOn} style={({ pressed }) => [st.option, gpsWanted && st.optionOn, pressed && st.pressed]} accessibilityRole="button">
        <Icon name="crosshairs-gps" tint={color.teal} />
        <View style={st.optionText}>
          <Text style={st.optionTitle}>Use my phone&apos;s GPS</Text>
          <Text style={st.optionSub}>Recommended. Deliveries and distances follow you, and the customer sees you coming.</Text>
        </View>
        {gpsWanted ? <Icon name="check-circle" tint={color.teal} /> : null}
      </Pressable>
      <Text style={st.or}>Or choose an area</Text>
      {PLACES.map((p) => {
        const on = !gpsWanted && user?.place?.label === p.label;
        return (
          <Pressable
            key={p.label}
            onPress={() => pick(p)}
            disabled={busy !== null}
            style={({ pressed }) => [st.option, on && st.optionOn, pressed && st.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Icon name="map-marker-outline" tint={on ? color.teal : color.mute} />
            <View style={st.optionText}>
              <Text style={st.optionTitle}>{p.label}</Text>
              <Text style={st.optionSub}>{p.sub}</Text>
            </View>
            {busy === p.label ? <ActivityIndicator color={color.teal} /> : on ? <Icon name="check-circle" tint={color.teal} /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const st = StyleSheet.create({
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12.5, fontWeight: '700', color: color.faint, textTransform: 'uppercase', letterSpacing: 0.6 },
  change: { fontSize: 15, fontWeight: '800', color: color.teal },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: color.tealTint, alignItems: 'center', justifyContent: 'center' },
  iconProblem: { backgroundColor: color.redTint },
  text: { flex: 1 },
  title: { fontSize: type.heading, fontWeight: '800', color: color.ink },
  sub: { fontSize: 14, color: color.mute, marginTop: 2, lineHeight: 19 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.line,
    marginBottom: 8,
  },
  optionOn: { borderColor: color.teal, backgroundColor: color.tealTint },
  optionText: { flex: 1 },
  optionTitle: { fontSize: type.body + 1, fontWeight: '800', color: color.ink },
  optionSub: { fontSize: 13.5, color: color.mute, marginTop: 2, lineHeight: 18 },
  or: { fontSize: 13, fontWeight: '800', color: color.faint, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 10 },
  pressed: { opacity: 0.8 },
});
