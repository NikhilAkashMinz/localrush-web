// Logging in with a mobile number. There is no SMS provider yet, so any 4-digit code works,
// the same as on the website. Only delivery partner accounts can log in here.

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorText } from '../api';
import { phoneText } from '../format';
import { useApp } from '../store';
import { color, radius, type } from '../theme';
import type { DemoAccount } from '../types';
import { Button, Icon, LogoMark } from '../ui';
import ServerSheet from './ServerSheet';

export default function LoginScreen() {
  const { api, login, server } = useApp();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState<DemoAccount[]>([]);
  const [status, setStatus] = useState<'checking' | 'ok' | 'down'>('checking');
  const [serverOpen, setServerOpen] = useState(false);

  // Check the server, and fetch the ready-made demo partners, whenever the address changes.
  useEffect(() => {
    let gone = false;
    setStatus('checking');
    api
      .demo()
      .then(({ accounts }) => {
        if (gone) return;
        setDemo(accounts.filter((a) => a.role === 'partner'));
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
      setError(errorText(e));
      setBusy(false);
    }
  };

  const serverLine = status === 'ok' ? 'Connected to LocalRush' : status === 'down' ? 'Cannot reach the LocalRush server' : 'Checking the server…';

  return (
    <KeyboardAvoidingView behavior="padding" style={st.screen}>
      <ScrollView
        contentContainerStyle={[st.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={st.brand}>
          <LogoMark size={68} />
          <Text style={st.title}>LocalRush Partner</Text>
          <Text style={st.lead}>Deliver orders from neighbourhood shops near you, and get paid for every km you ride.</Text>
        </View>

        <View style={st.card}>
          <Text style={st.cardTitle}>Log in</Text>

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
              <Text style={st.demoTitle}>Demo delivery partners: tap one to fill it in</Text>
              <View style={st.demoList}>
                {demo.map((a) => {
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
                      <Icon name="moped" size={20} tint={on ? color.white : color.teal} />
                      <View>
                        <Text style={[st.demoName, on && st.white]}>{a.name}</Text>
                        <Text style={[st.demoPhone, on && st.whiteSoft]}>{phoneText(a.phone)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
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
  title: { color: color.white, fontSize: 28, fontWeight: '800', marginTop: 6 },
  lead: { color: color.onDeep, fontSize: type.body, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: color.tealTint,
    width: '48.5%',
  },
  demoChipOn: { backgroundColor: color.teal },
  demoName: { fontSize: 14, fontWeight: '800', color: color.ink },
  demoPhone: { fontSize: 12.5, color: color.mute },
  white: { color: color.white },
  whiteSoft: { color: 'rgba(255,255,255,0.85)' },
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
