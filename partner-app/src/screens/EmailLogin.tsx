// The live service's login: the email the LocalRush team added the person with, and a password,
// the same login as on the website. People who log in to the website with Google get a password
// for the same account with "Set a password".

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../api';
import { createLogin, sendConfirmation, sendPasswordLink, signIn, type FirebaseSettings } from '../firebase';
import { color, radius, type } from '../theme';
import { Button, Icon } from '../ui';

type Mode = 'login' | 'create' | 'reset';

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default function EmailLogin({
  firebase,
  title,
  login,
  describe,
}: {
  firebase: FirebaseSettings;
  /** The card's heading, such as "Log in". */
  title: string;
  /** Log in to LocalRush with Firebase's proof. Throws the server's error. */
  login: (idToken: string) => Promise<void>;
  /** The server's error, in this app's words. */
  describe: (e: unknown) => string;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState<'go' | 'resend' | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  /** Proof for an email that is not confirmed yet, to send the confirmation again. */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);

  const address = email.trim().toLowerCase();

  const switchTo = (next: Mode) => {
    setMode(next);
    setError('');
    setNote('');
    setUnconfirmed(null);
  };

  const submit = async () => {
    setError('');
    setNote('');
    setUnconfirmed(null);
    if (!looksLikeEmail(address)) return setError('Enter your email address.');
    if (mode !== 'reset' && !password) return setError('Enter your password.');
    if (mode === 'create' && password.length < 8) return setError('Choose a password of at least 8 characters.');
    setBusy('go');
    try {
      if (mode === 'reset') {
        await sendPasswordLink(firebase, address);
        setMode('login');
        setPassword('');
        setNote(`If ${address} has a LocalRush login, we have emailed it a link to choose a password. Then log in here with that password.`);
      } else if (mode === 'create') {
        await createLogin(firebase, address, password);
        setMode('login');
        setNote(`We emailed a link to ${address}. Open it to confirm the address is yours, then tap Log in.`);
      } else {
        const idToken = await signIn(firebase, address, password);
        try {
          await login(idToken);
          return; // Logged in: this screen goes away.
        } catch (e) {
          if (e instanceof ApiError && e.code === 'verify-email') {
            setUnconfirmed(idToken);
            setNote(`Confirm your email first: open the link we emailed to ${address}, then tap Log in again.`);
          } else {
            setError(describe(e));
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logging in did not work. Please try again.');
    }
    setBusy(null);
  };

  const resend = async () => {
    if (!unconfirmed) return;
    setBusy('resend');
    try {
      await sendConfirmation(firebase, unconfirmed);
      setNote(`We emailed a new link to ${address}. Open it, then tap Log in again.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Please try again.');
    }
    setBusy(null);
  };

  return (
    <View>
      <Text style={st.cardTitle}>{mode === 'login' ? title : mode === 'create' ? 'Create your password' : 'Set a new password'}</Text>
      <Text style={st.lead}>
        {mode === 'login'
          ? 'Use the email the LocalRush team added you with. It is the same login as the website.'
          : mode === 'create'
            ? 'For your first time: use the email the LocalRush team added you with, and choose a password. We will email you a link to confirm the address.'
            : 'We will email you a link to choose a password. Use this if you forgot yours, or if you log in to the website with Google.'}
      </Text>

      <Text style={st.label}>Email</Text>
      <TextInput
        style={st.input}
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setError('');
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
        placeholderTextColor={color.faint}
        accessibilityLabel="Email"
      />

      {mode !== 'reset' ? (
        <>
          <Text style={st.label}>{mode === 'create' ? 'Choose a password' : 'Password'}</Text>
          <View style={st.passwordRow}>
            <TextInput
              style={[st.input, st.flex]}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError('');
              }}
              secureTextEntry={!shown}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              textContentType={mode === 'create' ? 'newPassword' : 'password'}
              placeholder={mode === 'create' ? 'At least 8 characters' : 'Your password'}
              placeholderTextColor={color.faint}
              onSubmitEditing={submit}
              accessibilityLabel="Password"
            />
            <Pressable
              onPress={() => setShown(!shown)}
              style={st.eye}
              accessibilityRole="button"
              accessibilityLabel={shown ? 'Hide the password' : 'Show the password'}
              hitSlop={6}
            >
              <Icon name={shown ? 'eye-off-outline' : 'eye-outline'} size={22} tint={color.mute} />
            </Pressable>
          </View>
        </>
      ) : null}

      {note ? (
        <View style={st.note} accessibilityRole="alert">
          <Icon name="email-check-outline" size={18} tint={color.tealDark} />
          <Text style={st.noteText}>{note}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={st.error} accessibilityRole="alert">
          <Icon name="alert-circle" size={18} tint={color.red} />
          <Text style={st.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button
        title={mode === 'login' ? 'Log in' : mode === 'create' ? 'Create password' : 'Email me a link'}
        icon={mode === 'login' ? 'login' : mode === 'create' ? 'account-plus-outline' : 'email-fast-outline'}
        onPress={submit}
        busy={busy === 'go'}
        style={st.submit}
      />
      {unconfirmed ? (
        <Button title="Send the link again" kind="secondary" icon="email-sync-outline" onPress={resend} busy={busy === 'resend'} style={st.submit} />
      ) : null}

      <View style={st.links}>
        {mode === 'login' ? (
          <>
            <Pressable onPress={() => switchTo('create')} accessibilityRole="button" hitSlop={6}>
              <Text style={st.link}>First time here? Create your password</Text>
            </Pressable>
            <Pressable onPress={() => switchTo('reset')} accessibilityRole="button" hitSlop={6}>
              <Text style={st.link}>Forgot it, or use Google on the website? Set a password</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => switchTo('login')} accessibilityRole="button" hitSlop={6}>
            <Text style={st.link}>Back to log in</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  cardTitle: { fontSize: type.title, fontWeight: '800', color: color.ink, marginBottom: 6 },
  lead: { fontSize: 14, color: color.mute, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '700', color: color.mute, marginTop: 14, marginBottom: 6 },
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
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eye: { padding: 10, borderRadius: radius.button, backgroundColor: color.paper, borderWidth: 1.5, borderColor: color.line },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: color.tealTint },
  noteText: { flex: 1, color: color.tealDark, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  error: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: color.redTint },
  errorText: { flex: 1, color: color.red, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  submit: { marginTop: 14 },
  links: { marginTop: 16, gap: 12, alignItems: 'center' },
  link: { color: color.teal, fontWeight: '700', fontSize: 14, textAlign: 'center' },
});
