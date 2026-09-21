import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { palette, statusColors } from '@/theme/colors';
import { useSession } from '@/stores/session';

export default function SignUpScreen() {
  const signUp = useSession((s) => s.signUp);
  const isGuest = useSession((s) => s.status === 'guest');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    const result = await signUp(email, password);
    setBusy(false);
    if (result.ok) router.replace('/');
    else setError(result.error ?? null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ title: 'Create account' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.blurb}>
          {isGuest
            ? 'Your reports and settings from this device carry over to the new account.'
            : 'An account keeps your settings and report history across devices.'}
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
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="At least 6 characters"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button label="Create account" onPress={onSubmit} loading={busy} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => router.replace('/sign-in')}
            disabled={busy}
          />
        </View>

        <Text style={styles.fineprint}>
          Passwords are hashed by Supabase Auth with bcrypt and are never stored or transmitted in
          plain text (SOW M1 AC3).
        </Text>
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
  fineprint: { color: palette.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },
});
