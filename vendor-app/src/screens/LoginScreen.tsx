// Logging in with a mobile number. There is no SMS provider yet, so any 4-digit code works,
// the same as on the website. Only shop owner accounts can log in here.

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, errorText } from '../api';
import { phoneText } from '../format';
import { useApp } from '../store';
import { color, radius, type } from '../theme';
import type { DemoAccount } from '../types';
import { Button, Icon, LogoMark } from '../ui';
import ServerSheet from './ServerSheet';

/** How many demo shops to show before "Show all". */
const FIRST = 4;

/** The server's message, put the way it reads in this app. */
function loginError(e: unknown) {
  if (e instanceof ApiError && e.code === 'wrong-seat') {
    return /partner/.test(e.message)
      ? 'That number belongs to a delivery partner. Log in with it in the LocalRush Partner app instead.'
      : 'That number belongs to a customer. This app is for shop owners.';
  }
  if (e instanceof ApiError && e.code === 'unknown') return 'No shop owner account uses that number. Tap one of the demo shops below to try the app.';
  return errorText(e);
}

export default function LoginScreen() {
  const { api, login, server } = useApp();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState<DemoAccount[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState<'checking' | 'ok' | 'down'>('checking');
  const [serverOpen, setServerOpen] = useState(false);

  // Check the server, and fetch the ready-made demo shop owners, whenever the address changes.
  useEffect(() => {
    let gone = false;
    setStatus('checking');
    api
      .demo()
      .then(({ accounts }) => {
        if (gone) return;
        setDemo(accounts.filter((a) => a.role === 'shop'));
        setStatus('ok');
      })
      .catch(() => {
        if (gone) return;
        setDemo([]);
        setStatus('down');
      });
    return () => {
      gone = true;
    };
  }, [api, server]);

  const submit = async () => {
    setError('');
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter your 10-digit mobile number.');
    if (!/^\d{4}$/.test(code)) return setError('Enter the 4-digit code.');
    setBusy(true);
    try {
      await login(phone, code);
    } catch (e) {
      setError(loginError(e));
      setBusy(false);
    }
  };

  const serverLine = status === 'ok' ? 'Connected to LocalRush' : status === 'down' ? 'Cannot reach the LocalRush server' : 'Checking the server…';
  const shown = showAll ? demo : demo.slice(0, FIRST);

  return (
    <KeyboardAvoidingView behavior="padding" style={st.screen}>
      <ScrollView
        contentContainerStyle={[st.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={st.brand}>
          <View>
            <LogoMark size={68} />
            <View style={st.badge}>
              <Icon name="storefront" size={18} tint={color.deep} />
            </View>
          </View>
          <Text style={st.title}>LocalRush Vendor</Text>
          <Text style={st.lead}>Take orders from customers near your shop, pack them for pickup, and keep your stock up to date.</Text>
        </View>

        <View style={st.card}>
          <Text style={st.cardTitle}>Log in to your shop</Text>

          <Text style={st.label}>Mobile number</Text>
          <View style={st.phoneRow}>
            <View style={st.prefix}>
              <Text style={st.prefixText}>+91</Text>
            </View>
            <TextInput
              style={[st.input, st.flex]}
              value={phone}
              onChangeText={(t) => {
                setPhone(t.replace(/\D/g, '').slice(0, 10));
                setError('');
              }}
              keyboardType="number-pad"
              placeholder="10-digit number"
              placeholderTextColor={color.faint}
              maxLength={10}
              accessibilityLabel="Mobile number"
            />
          </View>

          <Text style={st.label}>Code</Text>
          <TextInput
            style={[st.input, code ? st.code : null]}
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\D/g, '').slice(0, 4));
              setError('');
            }}
            keyboardType="number-pad"
            placeholder="4 digits"
            placeholderTextColor={color.faint}
            maxLength={4}
            onSubmitEditing={submit}
            accessibilityLabel="Code"
          />
          <Text style={st.hint}>Demo login: no SMS is sent, so any 4 digits work.</Text>

          {error ? (
            <View style={st.error} accessibilityRole="alert">
              <Icon name="alert-circle" size={18} tint={color.red} />
              <Text style={st.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button title="Log in" icon="login" onPress={submit} busy={busy} style={st.submit} />

          {demo.length > 0 ? (
            <View style={st.demo}>
              <Text style={st.demoTitle}>Demo shops: tap one to fill it in</Text>
              <View style={st.demoList}>
                {shown.map((a) => {
                  const on = phone === a.phone;
                  return (
                    <Pressable
                      key={a.phone}
                      accessibilityRole="button"
                      accessibilityLabel={`${a.name}, ${a.phone}`}
                      onPress={() => {
                        setPhone(a.phone);
                        setCode('1234');
                        setError('');
                      }}
                      style={({ pressed }) => [st.demoChip, on && st.demoChipOn, pressed && st.pressed]}
                    >
                      <Icon name="storefront-outline" size={20} tint={on ? color.white : color.teal} />
                      <View style={st.flex}>
                        <Text style={[st.demoName, on && st.white]} numberOfLines={2}>
                          {a.name}
                        </Text>
                        <Text style={[st.demoPhone, on && st.whiteSoft]}>{phoneText(a.phone)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {demo.length > FIRST ? (
                <Pressable onPress={() => setShowAll(!showAll)} accessibilityRole="button" style={st.more} hitSlop={8}>
                  <Text style={st.moreText}>{showAll ? 'Show fewer' : `Show all ${demo.length} shops`}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <Pressable onPress={() => setServerOpen(true)} style={({ pressed }) => [st.server, pressed && st.pressed]} accessibilityRole="button">
          <View style={[st.serverDot, { backgroundColor: status === 'ok' ? '#4ADE80' : status === 'down' ? '#FF8A8A' : color.gold }]} />
          <View style={st.flex}>
            <Text style={st.serverLabel}>{serverLine}</Text>
            <Text style={st.serverText} numberOfLines={1}>
              {server || 'No server address yet'}
            </Text>
          </View>
          <Text style={st.serverChange}>Change</Text>
        </Pressable>
        {status === 'down' ? (
          <Text style={st.serverHelp}>
            Start the website on your laptop with npm run dev, keep this phone on the same Wi-Fi, and check the address.
          </Text>
        ) : null}
      </ScrollView>
      <ServerSheet visible={serverOpen} onClose={() => setServerOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.deep },
  scroll: { paddingHorizontal: 18, flexGrow: 1 },
  flex: { flex: 1 },
  brand: { alignItems: 'center', gap: 10, marginBottom: 24 },
  badge: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.gold,
    borderWidth: 3,
    borderColor: color.deep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: color.white, fontSize: 28, fontWeight: '800', marginTop: 6 },
  lead: { color: color.onDeep, fontSize: type.body, textAlign: 'center', lineHeight: 21, maxWidth: 330 },
  card: { backgroundColor: color.card, borderRadius: 22, padding: 18 },
  cardTitle: { fontSize: type.title, fontWeight: '800', color: color.ink, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', color: color.mute, marginTop: 14, marginBottom: 6 },
  phoneRow: { flexDirection: 'row', gap: 8 },
  prefix: {
    borderWidth: 1.5,
    borderColor: color.line,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: color.paper,
  },
  prefixText: { fontSize: 18, fontWeight: '700', color: color.ink },
  input: {
    borderWidth: 1.5,
    borderColor: color.line,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 19,
    color: color.ink,
    backgroundColor: color.paper,
  },
  code: { letterSpacing: 6, fontWeight: '700' },
  hint: { fontSize: 13, color: color.mute, marginTop: 6 },
  error: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: color.redTint },
  errorText: { flex: 1, color: color.red, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  submit: { marginTop: 16 },
  demo: { marginTop: 18, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 14 },
  demoTitle: { fontSize: 13, fontWeight: '700', color: color.mute, marginBottom: 10 },
  demoList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  demoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: color.tealTint,
    width: '48.5%',
  },
  demoChipOn: { backgroundColor: color.teal },
  demoName: { fontSize: 13.5, fontWeight: '800', color: color.ink, lineHeight: 17 },
  demoPhone: { fontSize: 12, color: color.mute, marginTop: 1 },
  white: { color: color.white },
  whiteSoft: { color: 'rgba(255,255,255,0.85)' },
  more: { alignSelf: 'center', marginTop: 12 },
  moreText: { color: color.teal, fontWeight: '800', fontSize: 14 },
  pressed: { opacity: 0.8 },
  server: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: color.onDeepFaint,
  },
  serverDot: { width: 10, height: 10, borderRadius: 5 },
  serverLabel: { color: color.white, fontWeight: '700', fontSize: 14 },
  serverText: { color: color.onDeep, fontSize: 13, marginTop: 1 },
  serverChange: { color: color.gold, fontWeight: '800', fontSize: 14 },
  serverHelp: { color: color.onDeep, fontSize: 13, lineHeight: 18, marginTop: 10, textAlign: 'center' },
});
