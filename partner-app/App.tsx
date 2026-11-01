// LocalRush Partner: the delivery partner's phone app for LocalRush.
// It uses the same server as the LocalRush website (the Next.js app in the folder above).

import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import Main from './src/screens/Main';
import { AppProvider, useApp } from './src/store';
import { color } from './src/theme';
import { LogoMark } from './src/ui';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { ready, user } = useApp();
  if (!ready) {
    return (
      <View style={st.splash}>
        <LogoMark size={72} />
        <Text style={st.splashTitle}>LocalRush Partner</Text>
        <ActivityIndicator color={color.gold} style={st.spinner} />
      </View>
    );
  }
  return user ? <Main /> : <LoginScreen />;
}

const st = StyleSheet.create({
  splash: { flex: 1, backgroundColor: color.deep, alignItems: 'center', justifyContent: 'center', gap: 14 },
  splashTitle: { color: color.white, fontSize: 24, fontWeight: '800' },
  spinner: { marginTop: 8 },
});
