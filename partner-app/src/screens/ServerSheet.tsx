// Where the LocalRush server is: the live website built into the app, the laptop Expo runs on, or typed in.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createApi, errorText } from '../api';
import { builtInServer, cleanServer, detectedServer } from '../config';
import { useApp } from '../store';
import { color, radius, type } from '../theme';
import { Button, Icon, Sheet } from '../ui';

export default function ServerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { server, serverSaved, setServer } = useApp();
  const detected = detectedServer();
  const builtIn = builtInServer();
  /** Where the app goes when the typed address is forgotten. */
  const fallback = builtIn ?? detected;
  const [text, setText] = useState(server);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);

  useEffect(() => {
    if (visible) {
      setText(server);
      setResult(null);
    }
  }, [visible, server]);

  const test = async () => {
    const clean = cleanServer(text);
    if (!clean) return setResult({ ok: false, text: 'That is not a server address. It looks like https://localrush.onrender.com, or http://192.168.1.5:3000 for a laptop.' });
    setBusy('test');
    try {
      const health = await createApi(() => ({ server: clean, token: null })).health();
      const db = health.database && health.database !== 'not used' ? `, database ${health.database}` : '';
      setResult({
        ok: true,
        text: health.mode === 'live' ? 'Connected to LocalRush, the live service.' : `Connected to the LocalRush demo. Storage: ${health.storage ?? 'unknown'}${db}.`,
      });
    } catch (e) {
      setResult({ ok: false, text: errorText(e) });
    }
    setBusy(null);
  };

  const save = async () => {
    setBusy('save');
    try {
      await setServer(text);
      setBusy(null);
      onClose();
    } catch (e) {
      setResult({ ok: false, text: errorText(e) });
      setBusy(null);
    }
  };

  const useDetected = async () => {
    await setServer(null);
    onClose();
  };

  return (
    <Sheet visible={visible} title="LocalRush server" onClose={onClose}>
      <Text style={st.p}>
        The app talks to the same server as the LocalRush website. Use the website&apos;s address, such as https://localrush.onrender.com. While
        testing on a laptop, use the laptop&apos;s Wi-Fi address and port 3000, with the phone on the same Wi-Fi.
      </Text>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          setResult(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://localrush.onrender.com"
        placeholderTextColor={color.faint}
        style={st.input}
        accessibilityLabel="Server address"
      />
      {builtIn && builtIn !== cleanServer(text) ? (
        <Pressable onPress={() => setText(builtIn)} style={st.detected} accessibilityRole="button">
          <Icon name="web" size={20} tint={color.teal} />
          <Text style={st.detectedText}>
            Use the LocalRush website: <Text style={st.bold}>{builtIn}</Text>
          </Text>
        </Pressable>
      ) : null}
      {detected && detected !== cleanServer(text) ? (
        <Pressable onPress={() => setText(detected)} style={st.detected} accessibilityRole="button">
          <Icon name="laptop" size={20} tint={color.teal} />
          <Text style={st.detectedText}>
            Use the laptop Expo is running on: <Text style={st.bold}>{detected}</Text>
          </Text>
        </Pressable>
      ) : null}
      {result ? (
        <View style={[st.result, { backgroundColor: result.ok ? color.greenTint : color.redTint }]}>
          <Icon name={result.ok ? 'check-circle' : 'alert-circle'} size={20} tint={result.ok ? color.green : color.red} />
          <Text style={[st.resultText, { color: result.ok ? color.green : color.red }]}>{result.text}</Text>
        </View>
      ) : null}
      <View style={st.row}>
        <Button title="Test" kind="secondary" icon="lan-connect" onPress={test} busy={busy === 'test'} style={st.flex} />
        <Button title="Save" icon="check" onPress={save} busy={busy === 'save'} style={st.flex} />
      </View>
      {serverSaved && fallback ? (
        <Pressable onPress={useDetected} accessibilityRole="button" style={st.forget}>
          <Text style={st.link}>Forget the typed address and use {fallback}</Text>
        </Pressable>
      ) : null}
      <View style={st.help}>
        <Icon name="information-outline" size={18} tint={color.mute} />
        <Text style={st.helpText}>
          Testing on a laptop? To find its address on Windows, open Command Prompt, run ipconfig and look for &quot;IPv4 Address&quot; under Wi-Fi.
          Start the website with npm run dev first.
        </Text>
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  p: { fontSize: type.body, color: color.mute, lineHeight: 21, marginBottom: 14 },
  input: {
    borderWidth: 1.5,
    borderColor: color.line,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: color.ink,
    backgroundColor: color.paper,
  },
  detected: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: color.tealTint },
  detectedText: { flex: 1, fontSize: 14, color: color.tealDark, lineHeight: 19 },
  bold: { fontWeight: '800' },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12, padding: 12, borderRadius: 12 },
  resultText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  flex: { flex: 1 },
  forget: { marginTop: 14, alignItems: 'center' },
  link: { color: color.teal, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  help: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 6 },
  helpText: { flex: 1, fontSize: 13, color: color.mute, lineHeight: 18 },
});
