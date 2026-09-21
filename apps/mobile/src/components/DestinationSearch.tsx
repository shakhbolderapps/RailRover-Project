import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { suggestPlaces, type LatLng, type PlaceSuggestion } from '@railrover/shared';

import { palette, statusColors } from '@/theme/colors';

interface Props {
  near: LatLng | null;
  onSelect: (place: PlaceSuggestion) => void;
  onClear: () => void;
  /** Set once a destination is chosen, so the field shows it instead of the raw query. */
  selected: PlaceSuggestion | null;
}

/** Long enough that the driver has typed something meaningful, short enough to feel instant. */
const DEBOUNCE_MS = 300;

/**
 * Destination search (SOW M4-AC1), at the top of the map per M2-AC3.
 *
 * Debounced rather than per-keystroke. Photon is a free public instance, and a request per
 * character is both wasteful and the behaviour that gets an app blocked — which would take
 * destination search down for every driver at once.
 */
export function DestinationSearch({ near, onSelect, onClear, selected }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (selected || query.trim().length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();

    timer.current = setTimeout(() => {
      void (async () => {
        try {
          setSuggestions(
            await suggestPlaces(query, {
              // Bias toward the driver so "Main St" means the one they are near.
              ...(near ? { near } : {}),
              signal: controller.signal,
            }),
          );
          setError(null);
        } catch {
          if (!controller.signal.aborted) setError('Could not search right now.');
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, near, selected]);

  const reset = () => {
    setQuery('');
    setSuggestions([]);
    setError(null);
    onClear();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <TextInput
          value={selected ? selected.label : query}
          onChangeText={setQuery}
          placeholder="Where to?"
          placeholderTextColor={palette.textMuted}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          editable={!selected}
        />
        {searching ? <ActivityIndicator size="small" color={palette.textMuted} /> : null}
        {selected || query.length > 0 ? (
          <Pressable onPress={reset} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear destination">
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {suggestions.length > 0 ? (
        <View style={styles.list}>
          {suggestions.map((place) => (
            <Pressable
              key={place.id}
              onPress={() => {
                setSuggestions([]);
                onSelect(place);
              }}
              style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
            >
              <Text style={styles.rowText} numberOfLines={2}>
                {place.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, color: palette.text, fontSize: 16 },
  clear: { color: palette.textMuted, fontSize: 16, fontWeight: '700' },
  error: { color: statusColors.red, fontSize: 13, paddingHorizontal: 4 },
  list: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: 14, paddingVertical: 14 },
  rowPressed: { backgroundColor: palette.surfaceRaised },
  rowText: { color: palette.text, fontSize: 15, lineHeight: 21 },
});
