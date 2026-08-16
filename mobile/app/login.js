import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/auth/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { signIn, signUp, confirmSignUp, isAuthenticated } = useAuth();

  const [mode, setMode] = useState('signin'); // signin | signup | confirm
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (isAuthenticated) router.replace('/(tabs)/dashboard');
  }, [isAuthenticated, router]);

  const handleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signIn({ email, password });
      router.replace('/(tabs)/dashboard');
    } catch (e) {
      setError(e.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError('');
    setLoading(true);
    try {
      await signUp({ email, password, name });
      setMode('confirm');
    } catch (e) {
      setError(e.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      await signIn({ email, password });
      router.replace('/(tabs)/dashboard');
    } catch (e) {
      setError(e.message || 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  const renderField = (label, value, onChange, options = {}) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: c.surface2, borderColor: c.border, color: c.text }]}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={c.textSecondary}
        autoCapitalize="none"
        {...options}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]}>
          {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Confirm Email'}
        </Text>

        {mode === 'signup' && renderField('Name', name, setName, { placeholder: 'Your name' })}
        {mode !== 'confirm' && renderField('Email', email, setEmail, { placeholder: 'you@example.com', keyboardType: 'email-address' })}
        {mode !== 'confirm' && renderField('Password', password, setPassword, { placeholder: '••••••••', secureTextEntry: true })}
        {mode === 'confirm' && renderField('Confirmation Code', code, setCode, { placeholder: '123456', keyboardType: 'number-pad' })}

        {error ? <Text style={[styles.error, { color: c.red }]}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: c.accent }]}
          onPress={mode === 'signin' ? handleSignIn : mode === 'signup' ? handleSignUp : handleConfirm}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>
            {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Confirm'}
          </Text>}
        </TouchableOpacity>

        <View style={styles.links}>
          {mode !== 'signin' && (
            <TouchableOpacity onPress={() => setMode('signin')}>
              <Text style={[styles.link, { color: c.accent }]}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          )}
          {mode !== 'signup' && (
            <TouchableOpacity onPress={() => setMode('signup')}>
              <Text style={[styles.link, { color: c.accent }]}>Create account</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 16, borderWidth: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  error: { marginVertical: 10, fontSize: 13 },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  links: { marginTop: 18, gap: 10, alignItems: 'center' },
  link: { fontSize: 13, fontWeight: '600' },
});
