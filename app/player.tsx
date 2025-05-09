import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function PlayerScreen() {
  const router = useRouter();
  const { track, trackList } = useLocalSearchParams();
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackData, setTrackData] = useState(null);
  const [trackListData, setTrackListData] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (track) {
      try {
        setTrackData(JSON.parse(track));
      } catch (error) {
        setError('Invalid track data');
        Alert.alert('Error', 'Invalid track data', [{ text: 'OK', onPress: () => router.back() }]);
      }
    }
    if (trackList) {
      try {
        setTrackListData(JSON.parse(trackList));
      } catch (error) {
        console.warn('Invalid track list data');
      }
    }
  }, [track, trackList]);

  // Load and play audio with retry
  const loadSound = async (newTrackData, retryCount = 0) => {
    if (!newTrackData) return;
    setError(null);
    setIsLoading(true);
    const newSound = new Audio.Sound();
    try {
      const audioSource = typeof newTrackData.audio === 'string' ? { uri: newTrackData.audio } : newTrackData.audio;
      if (!audioSource.uri) {
        throw new Error('Invalid audio URI');
      }
      await newSound.loadAsync(audioSource);
      setSound(newSound);
      const status = await newSound.getStatusAsync();
      setDuration(status.durationMillis || 0);
      await newSound.playAsync();
      setIsPlaying(true);
      setPosition(0);
      setTrackData(newTrackData);

      newSound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded) {
          setPosition(status.positionMillis || 0);
          setDuration(status.durationMillis || 0);
          setIsPlaying(status.isPlaying);
        }
      });
    } catch (error) {
      console.error('Error loading sound:', error);
      if (retryCount < 2) {
        setTimeout(() => loadSound(newTrackData, retryCount + 1), 1000);
      } else {
        setError('Failed to load audio file');
        Alert.alert('Error', 'Failed to load audio file', [{ text: 'OK' }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (trackData) {
      loadSound(trackData);
    }
    return () => {
      if (sound) {
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(error => console.error('Error unloading sound:', error));
      }
    };
  }, [trackData]);

  // Toggle play/pause
  const togglePlay = async () => {
    if (!sound || isLoading) return;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error('Error toggling play:', error);
      setError('Failed to toggle playback');
      Alert.alert('Error', 'Failed to toggle playback', [{ text: 'OK' }]);
    }
  };

  // Seek to position
  const onSeek = async (value) => {
    if (!sound || isLoading) return;
    try {
      await sound.setPositionAsync(value);
      setPosition(value);
    } catch (error) {
      console.error('Error seeking:', error);
      setError('Failed to seek');
      Alert.alert('Error', 'Failed to seek', [{ text: 'OK' }]);
    }
  };

  // Play next track
  const playNext = () => {
    if (!trackListData.length || isLoading) return;
    const currentIndex = trackListData.findIndex(t => t.id === trackData?.id);
    if (currentIndex < trackListData.length - 1) {
      const nextTrack = trackListData[currentIndex + 1];
      loadSound(nextTrack);
    }
  };

  // Play previous track
  const playPrevious = () => {
    if (!trackListData.length || isLoading) return;
    const currentIndex = trackListData.findIndex(t => t.id === trackData?.id);
    if (currentIndex > 0) {
      const prevTrack = trackListData[currentIndex - 1];
      loadSound(prevTrack);
    }
  };

  // Format time
  const formatTime = (millis) => {
    const seconds = Math.floor(millis / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!trackData || error) {
    return (
      <LinearGradient colors={['#111827', '#1F2937']} style={styles.loadingContainer}>
        <Text style={styles.emptyText}>{error || 'Loading track...'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#111827', '#1F2937']} style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={28} color="#FFFFFF" />
      </TouchableOpacity>
      <Image
        source={trackData.image ? trackData.image : { uri: trackData.album_image }}
        style={styles.artwork}
        defaultSource={require('../assets/images/placeholder.jpg')}
        onError={() => console.warn('Failed to load image')}
      />
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {trackData.name}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {trackData.artist_name}
        </Text>
      </View>
      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={duration}
          value={position}
          onSlidingComplete={onSeek}
          minimumTrackTintColor="#3B82F6"
          maximumTrackTintColor="#4B5563"
          thumbTintColor="#3B82F6"
          disabled={!sound || isLoading}
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>
      <View style={styles.controls}>
        <TouchableOpacity onPress={playPrevious} disabled={!sound || isLoading || !trackListData.length}>
          <FontAwesome
            name="step-backward"
            size={32}
            color={sound && !isLoading && trackListData.length ? '#3B82F6' : '#6B7280'}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePlay} disabled={!sound || isLoading}>
          <FontAwesome
            name={isPlaying ? 'pause-circle' : 'play-circle'}
            size={64}
            color={sound && !isLoading ? '#3B82F6' : '#6B7280'}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={playNext} disabled={!sound || isLoading || !trackListData.length}>
          <FontAwesome
            name="step-forward"
            size={32}
            color={sound && !isLoading && trackListData.length ? '#3B82F6' : '#6B7280'}
          />
        </TouchableOpacity>
      </View>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
  },
  artwork: {
    width: 250,
    height: 250,
    borderRadius: 20,
    marginTop: 40,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  trackArtist: {
    color: '#9CA3AF',
    fontSize: 18,
    fontWeight: '500',
  },
  sliderContainer: {
    width: '100%',
    marginBottom: 20,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '60%',
    marginTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});