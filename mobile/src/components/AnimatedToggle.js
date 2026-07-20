import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 20;
const PADDING = 3;

const SPRING = { damping: 15, stiffness: 180, mass: 0.6 };

export default function AnimatedToggle({ value, onValueChange, activeColor }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const on = value ? 1 : 0;
  const progress = useSharedValue(on);
  const trackOn = activeColor || c.green;

  useEffect(() => {
    progress.value = withSpring(on, SPRING);
  }, [on]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * (TRACK_WIDTH - THUMB_SIZE - PADDING * 2) },
    ],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [c.surface2, trackOn]
    ),
  }));

  return (
    <Pressable onPress={() => onValueChange(!value)} hitSlop={8}>
      <Animated.View style={[styles.track, { borderColor: c.border }, trackStyle]}>
        <Animated.View style={[styles.thumb, { backgroundColor: c.white }, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    borderWidth: 1,
    padding: PADDING,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
