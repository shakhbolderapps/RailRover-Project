import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { palette, statusColors } from '@/theme/colors';
import { useSession } from '@/stores/session';

export default function SignInScreen() {
  const signIn = useSession((s) => s.signIn);
  const sendPasswordReset = useSession((s) => s.sendPasswordReset);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) router.replace('/');
    else setError(result.error ?? null);
  };

  /** SOW M1 edge case: a driver forgets their password. */
  const onForgotPassword = async () => {
    if (email.trim().length === 0) {
      setError('Enter your email address first, then tap this again.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await sendPasswordReset(email);
    setBusy(false);
    if (result.ok) {
      // Deliberately does not confirm whether an account exists — see auth-errors.ts.
      setNotice(`If an account exists for ${email.trim()}, a reset link is on its way.`);
    } else {
      setError(result.error ?? null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ title: 'Sign in' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.blurb}>
          Signing in restores your settings and report history on this device.
        </Text>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          placeholder="Your password"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <View style={styles.actions}>
          <Button label="Sign in" onPress={onSubmit} loading={busy} />
          <Button label="Forgot password?" variant="ghost" onPress={onForgotPassword} disabled={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: 24, gap: 18 },
  blurb: { color: palette.textMuted, fontSize: 15, lineHeight: 22 },
  actions: { gap: 8, marginTop: 6 },
  error: { color: statusColors.red, fontSize: 14, lineHeight: 20 },
  notice: { color: statusColors.green, fontSize: 14, lineHeight: 20 },
});
