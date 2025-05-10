import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePlayback } from '../contexts/PlaybackContext';

export default function PlayerScreen() {
  const router = useRouter();
  const { track, trackList } = useLocalSearchParams();
  const { play, pause, resume, seek, playNext, playPrevious, isPlaying, position, duration, currentTrack } = usePlayback();
  const [trackData, setTrackData] = useState(null);
  const [trackListData, setTrackListData] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState(null);

  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (track) {
      try {
        const parsedTrack = JSON.parse(track);
        parsedTrack.album_image = parsedTrack.album_image && isValidUrl(parsedTrack.album_image) ? parsedTrack.album_image : null;
        console.log('Parsed track:', parsedTrack.name, 'ID:', parsedTrack.id);
        setTrackData(parsedTrack);
        if (!currentTrack || currentTrack.id !== parsedTrack.id) {
          play(parsedTrack, trackListData);
        }
      } catch (error) {
        console.error('Error parsing track:', error);
        setError('Invalid track data');
        Alert.alert('Error', 'Invalid track data', [{ text: 'OK', onPress: () => router.back() }]);
      }
    }
    if (trackList) {
      try {
        const parsedList = JSON.parse(trackList).map(t => ({
          ...t,
          album_image: t.album_image && isValidUrl(t.album_image) ? t.album_image : null,
        }));
        console.log('Parsed track list IDs:', parsedList.map(t => t.id));
        setTrackListData(parsedList);
      } catch (error) {
        console.error('Error parsing track list:', error);
        setTrackListData([]);
      }
    }
  }, [track, trackList, play]);

  useEffect(() => {
    if (currentTrack?.trackList) {
      console.log('Current track list IDs:', currentTrack.trackList.map(t => t.id));
      setTrackListData(currentTrack.trackList);
    }
  }, [currentTrack]);

  const togglePlay = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (isPlaying) {
        await pause();
      } else {
        await resume();
      }
    } catch (error) {
      console.error('Error toggling play:', error);
      setError('Failed to toggle playback');
      Alert.alert('Error', 'Failed to toggle playback', [{ text: 'OK' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const onSeek = async (value) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await seek(value);
    } catch (error) {
      console.error('Error seeking:', error);
      setError('Failed to seek');
      Alert.alert('Error', 'Failed to seek', [{ text: 'OK' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const debounce = (func, delay) => {
    return (...args) => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      setIsLoading(true);
      const timeout = setTimeout(async () => {
        try {
          await func(...args);
        } finally {
          setIsLoading(false);
        }
      }, delay);
      setDebounceTimeout(timeout);
    };
  };

  const debouncedPlayNext = debounce(playNext, 500);
  const debouncedPlayPrevious = debounce(playPrevious, 500);

  const formatTime = (millis) => {
    const seconds = Math.floor(millis / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const canGoNext = currentTrack?.trackList?.length > 1 && trackListData.findIndex(t => t.id === currentTrack?.id) < trackListData.length - 1;
  const canGoPrevious = currentTrack?.trackList?.length > 1 && trackListData.findIndex(t => t.id === currentTrack?.id) > 0;

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

  const PLACEHOLDER_IMAGE = require('../assets/images/placeholder.jpg');

  return (
    <LinearGradient colors={['#111827', '#1F2937']} style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={28} color="#FFFFFF" />
      </TouchableOpacity>
      <Image
        source={trackData.image || (trackData.album_image ? { uri: trackData.album_image } : PLACEHOLDER_IMAGE)}
        style={styles.artwork}
        defaultSource={PLACEHOLDER_IMAGE}
        onError={() => console.warn(`Failed to load image for track: ${trackData.name}, album_image: ${trackData.album_image}`)}
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
          disabled={isLoading}
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>
      <View style={styles.controls}>
        <TouchableOpacity onPress={debouncedPlayPrevious} disabled={isLoading || !canGoPrevious}>
          <FontAwesome
            name="step-backward"
            size={32}
            color={isLoading || !canGoPrevious ? '#6B7280' : '#F97316'}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePlay} disabled={isLoading}>
          <FontAwesome
            name={isPlaying ? 'pause-circle' : 'play-circle'}
            size={64}
            color={isLoading ? '#6B7280' : '#F97316'}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={debouncedPlayNext} disabled={isLoading || !canGoNext}>
          <FontAwesome
            name="step-forward"
            size={32}
            color={isLoading || !canGoNext ? '#6B7280' : '#F97316'}
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