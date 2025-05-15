import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef } from 'react';
import { Animated, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  return ( 
    <ImageBackground
      source={require('../assets/images/player.png')} // Verify this path
      style={styles.background}
      resizeMode="cover"
      onError={(e) => console.log('Image load error:', e.nativeEvent.error)}
    >
      {/* Optional: Uncomment if using expo-linear-gradient */}
      {/* <LinearGradient
        colors={['rgba(0, 0, 0, 0.7)', 'rgba(74, 4, 141, 0.5)', 'rgba(0, 0, 0, 0.7)']}
        style={styles.gradient}
      > */}
      <View style={styles.overlay}>
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={styles.title}>Welcome to EchoPllay</Text>
          <Text style={styles.subtitle}>
            Explore a world of music with seamless streaming and vibrant beats! Developed for adyems.
          </Text>
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('play')}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Start Listening</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      {/* </LinearGradient> */}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)', // Darker overlay for contrast
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 20,
    color: '#D1D5DB',
    textAlign: 'center',
    marginBottom: 48,
    paddingHorizontal: 16,
    lineHeight: 28,
    fontWeight: '400',
  },
  button: {
    backgroundColor: '#F97316',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
});