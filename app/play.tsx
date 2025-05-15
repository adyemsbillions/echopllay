import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePlayback } from '../contexts/PlaybackContext';

// Jamendo API fetch function
async function fetchWebApi(endpoint: string) {
  try {
    const res = await fetch(`https://api.jamendo.com/v3.0${endpoint}`);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// Fetch tracks from Jamendo
async function getOnlineTracks() {
  try {
    // Replace YOUR_CLIENT_ID with your Jamendo API client ID
    const clientId = 'a31365c7'; // Register at https://developer.jamendo.com/
    const data = await fetchWebApi(`/tracks/?client_id=${clientId}&format=json&limit=50&order=downloads_total`);
    console.log('Jamendo tracks response:', data); // Debug log
    return data.results;
  } catch (error) {
    console.error('Error fetching Jamendo tracks:', error);
    throw error;
  }
}

export default function PlayScreen() {
  const router = useRouter();
  const { play, pause, resume, isPlaying, currentTrack } = usePlayback();
  const [tracks, setTracks] = useState([]);
  const [localTracks, setLocalTracks] = useState([]);
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [isConnected, setIsConnected] = useState(true);
  const [activeSegment, setActiveSegment] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [favorites, setFavorites] = useState({});
  const [hasPermission, setHasPermission] = useState(null);

  const PLACEHOLDER_IMAGE = require('../assets/images/placeholder.jpg');

  // Validate URL
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Request media library permissions
  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Media library access is limited in Expo Go. Create a development build for full access or grant permission.',
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Learn More',
              onPress: () => Linking.openURL('https://docs.expo.dev/develop/development-builds/create-a-build'),
            },
          ]
        );
      }
    })();
  }, []);

  // Fetch online tracks
  const fetchTracks = async (isRetry = false) => {
    if (!isConnected) {
      setTracks([]);
      setFilteredTracks([]);
      Alert.alert('Offline', 'No internet connection. Showing local tracks only.');
      return;
    }
    setIsLoading(true);
    try {
      let onlineTracks = await getOnlineTracks();
      let validTracks = onlineTracks
        .filter((track: any) => track && track.audio && isValidUrl(track.audio))
        .map((track: any) => ({
          id: track.id,
          name: track.name || 'Unknown Track',
          artist_name: track.artist_name || 'Unknown Artist',
          duration: track.duration || 0,
          audio: { uri: track.audio },
          album_image: track.image && isValidUrl(track.image) ? track.image : null,
          isPreview: false,
        }));

      if (validTracks.length === 0) {
        Alert.alert('Warning', 'No tracks with valid URLs found.');
      } else if (validTracks.length < onlineTracks.length) {
        Alert.alert('Notice', `${onlineTracks.length - validTracks.length} tracks lack valid URLs and are excluded.`);
      }

      setTracks(validTracks);
      setFilteredTracks(validTracks);
    } catch (error) {
      console.error('Error fetching online tracks:', error);
      const errorMessage = error.message.includes('YOUR_CLIENT_ID')
        ? 'Invalid Jamendo client ID. Please register at https://developer.jamendo.com/ and update the client ID in the code.'
        : 'Failed to load online tracks. Please check your network or try again later.';
      if (!isRetry) {
        Alert.alert('Error', errorMessage, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => fetchTracks(true) },
        ]);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch local tracks from device
  const fetchLocalTracks = async () => {
    if (!hasPermission) {
      setLocalTracks([]);
      setFilteredTracks([]);
      return;
    }
    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        mediaType: ['audio'],
        first: 50,
      });
      const localTracks = assets.map((asset: any) => ({
        id: asset.id,
        name: asset.filename || 'Unknown Track',
        artist_name: asset.filename.split('-')[0]?.trim() || 'Unknown Artist',
        duration: asset.duration || 0,
        audio: { uri: asset.uri },
        image: null,
        isPreview: false,
      }));
      setLocalTracks(localTracks);
      setFilteredTracks(localTracks);
    } catch (error) {
      console.error('Error fetching local tracks:', error);
      Alert.alert('Error', 'Failed to load local tracks');
    }
  };

  // Handle pull-to-refresh
  const onRefresh = () => {
    setIsRefreshing(true);
    if (activeSegment === 'all') {
      fetchTracks();
    } else {
      fetchLocalTracks();
      setIsRefreshing(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchTracks();
    fetchLocalTracks();
  }, [isConnected, hasPermission]);

  // Network monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  // Filter tracks based on search query
  useEffect(() => {
    const data = activeSegment === 'all' ? tracks : localTracks;
    if (searchQuery.trim() === '') {
      setFilteredTracks(data);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = data.filter(
        (track: any) =>
          track.name.toLowerCase().includes(query) ||
          track.artist_name.toLowerCase().includes(query)
      );
      setFilteredTracks(filtered);
    }
  }, [searchQuery, tracks, localTracks, activeSegment]);

  // Toggle favorite status
  const toggleFavorite = (trackId: string) => {
    setFavorites((prev: any) => ({
      ...prev,
      [trackId]: !prev[trackId],
    }));
  };

  // Play or pause track
  const playTrack = async (track: any) => {
    if (!track.audio) {
      Alert.alert('Error', 'Invalid audio source');
      return;
    }
    if (currentTrack?.id === track.id && isPlaying) {
      await pause();
    } else {
      await play(track, filteredTracks);
    }
  };

  // Render track item
  const renderTrack = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.trackItem}
      onPress={() => playTrack(item)}
      accessibilityLabel={`Play ${item.name} by ${item.artist_name}`}
      accessibilityRole="button"
    >
      <Image
        source={item.image || (item.album_image ? { uri: item.album_image } : PLACEHOLDER_IMAGE)}
        style={styles.trackArtwork}
        defaultSource={PLACEHOLDER_IMAGE}
        onError={() => console.warn(`Failed to load image for track: ${item.name}`)}
      />
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {item.artist_name}
        </Text>
        <View style={styles.trackMeta}>
          <MaterialIcons name="audiotrack" size={16} color="#A3A3A3" />
          <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>
        </View>
      </View>
      <View style={styles.trackActions}>
        <TouchableOpacity onPress={() => toggleFavorite(item.id)}>
          <FontAwesome
            name={favorites[item.id] ? 'heart' : 'heart-o'}
            size={20}
            color={favorites[item.id] ? '#EF4444' : '#A3A3A3'}
          />
        </TouchableOpacity>
        <FontAwesome
          name={currentTrack?.id === item.id && isPlaying ? 'pause-circle' : 'play-circle'}
          size={28}
          color={currentTrack?.id === item.id && isPlaying ? '#EF4444' : '#F97316'}
          style={styles.playIcon}
        />
      </View>
    </TouchableOpacity>
  );

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render now playing section
  const renderNowPlaying = () => {
    if (!currentTrack) return null;
    return (
      <TouchableOpacity
        style={styles.nowPlaying}
        onPress={() =>
          router.push({
            pathname: '/player',
            params: {
              track: JSON.stringify(currentTrack),
              trackList: JSON.stringify(filteredTracks),
            },
          })
        }
      >
        <Image
          source={currentTrack.image || (currentTrack.album_image ? { uri: currentTrack.album_image } : PLACEHOLDER_IMAGE)}
          style={styles.nowPlayingArtwork}
          defaultSource={PLACEHOLDER_IMAGE}
          onError={() => console.warn(`Failed to load now playing image for track: ${currentTrack.name}`)}
        />
        <View style={styles.nowPlayingInfo}>
          <Text style={styles.nowPlayingTitle} numberOfLines={1}>
            {currentTrack.name}
          </Text>
          <Text style={styles.nowPlayingArtist} numberOfLines={1}>
            {currentTrack.artist_name}
          </Text>
        </View>
        <TouchableOpacity onPress={() => playTrack(currentTrack)}>
          <FontAwesome
            name={isPlaying ? 'pause-circle' : 'play-circle'}
            size={32}
            color={isPlaying ? '#EF4444' : '#3B82F6'}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={['#111827', '#1F2937']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>EchoPlay</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search songs or artists..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentButton, activeSegment === 'all' && styles.activeSegment]}
            onPress={() => setActiveSegment('all')}
          >
            <Text style={[styles.segmentText, activeSegment === 'all' && styles.activeSegmentText]}>Online</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, activeSegment === 'device' && styles.activeSegment]}
            onPress={() => setActiveSegment('device')}
          >
            <Text style={[styles.segmentText, activeSegment === 'device' && styles.activeSegmentText]}>My Device</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!isConnected && (
        <View style={styles.offlineWarning}>
          <MaterialIcons name="signal-wifi-off" size={20} color="#FFF" />
          <Text style={styles.offlineText}>Offline Mode - Showing local tracks only</Text>
        </View>
      )}

      {isLoading && !isRefreshing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}

      <FlatList
        data={filteredTracks}
        renderItem={renderTrack}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {activeSegment === 'all'
              ? isConnected
                ? 'No online tracks available'
                : 'Connect to load online tracks'
              : hasPermission
              ? 'No local tracks found'
              : 'Media library permission denied'}
          </Text>
        }
        ListFooterComponent={renderNowPlaying}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#374151',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 10,
    padding: 4,
    marginHorizontal: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeSegment: {
    backgroundColor: '#F97316',
  },
  segmentText: {
    color: '#D1D5DB',
    fontSize: 16,
    fontWeight: '500',
  },
  activeSegmentText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  trackArtwork: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 12,
  },
  trackInfo: {
    flex: 1,
    marginRight: 12,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  trackArtist: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 4,
  },
  trackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackDuration: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playIcon: {
    marginRight: 8,
  },
  listContent: {
    paddingBottom: 80,
  },
  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    fontSize: 16,
    marginTop: 40,
  },
  offlineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  nowPlayingArtwork: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  nowPlayingInfo: {
    flex: 1,
    marginRight: 12,
  },
  nowPlayingTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  nowPlayingArtist: {
    color: '#9CA3AF',
    fontSize: 14,
  },
});