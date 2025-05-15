import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
    throw error;
  }
}

// Fetch tracks from Jamendo
async function getOnlineTracks(offset = 0, limit = 100, searchQuery = '') {
  try {
    const clientId = 'a31365c7'; // Your Jamendo API client ID
    const queryParam = searchQuery ? `&namesearch=${encodeURIComponent(searchQuery)}` : '';
    const endpoint = `/tracks/?client_id=${clientId}&format=json&limit=${limit}&offset=${offset}&order=downloads_total${queryParam}`;
    const data = await fetchWebApi(endpoint);
    console.log('Jamendo tracks response:', {
      offset,
      searchQuery,
      count: data.results.length,
      audioFields: data.results.map(t => t.audio),
    });
    return data.results;
  } catch (error) {
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
  const [pageOffset, setPageOffset] = useState(0);
  const [hasMoreTracks, setHasMoreTracks] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const PLACEHOLDER_IMAGE = require('../assets/images/placeholder.jpg');

  // Validate URL
  const isValidUrl = (url: string) => {
    if (!url || typeof url !== 'string') {
      console.log('Invalid URL:', url);
      return false;
    }
    try {
      new URL(url);
      return true;
    } catch (error) {
      console.log('Invalid URL:', url, error);
      return false;
    }
  };

  // Validate track
  const isValidTrack = (track: any) => {
    return (
      track &&
      track.id &&
      track.name &&
      track.audio &&
      track.audio.uri &&
      isValidUrl(track.audio.uri)
    );
  };

  // Request media library permissions
  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        setErrorMessage(
          'Media library access is limited in Expo Go. Create a development build for full access or grant permission.'
        );
      }
    })();
  }, []);

  // Fetch online tracks
  const fetchTracks = async (isRetry = false, append = false, query = '') => {
    if (!isConnected) {
      setTracks([]);
      setFilteredTracks([]);
      setErrorMessage('No internet connection. Showing local tracks only.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      let onlineTracks = await getOnlineTracks(pageOffset, 100, query);
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

      // Deduplicate tracks by ID
      const trackIds = new Set(tracks.map(t => t.id));
      validTracks = validTracks.filter(track => !trackIds.has(track.id));

      console.log(`Fetched ${onlineTracks.length} tracks, ${validTracks.length} valid after filtering`);

      if (validTracks.length === 0 && retryCount < MAX_RETRIES) {
        setErrorMessage(`No valid tracks found${query ? ' for search' : ''}. Retrying with next page...`);
        setPageOffset(prev => prev + 100);
        setRetryCount(prev => prev + 1);
        setTimeout(() => fetchTracks(isRetry, append, query), 2000);
        return;
      } else if (validTracks.length === 0) {
        setErrorMessage(`No valid tracks found${query ? ' for search' : ''} after retries. Try a different search or refresh.`);
        setHasMoreTracks(false);
      } else if (validTracks.length < onlineTracks.length) {
        setErrorMessage(`${onlineTracks.length - validTracks.length} tracks lack valid URLs and are excluded.`);
      }

      setTracks(prev => (append ? [...prev, ...validTracks] : validTracks));
      setFilteredTracks(prev => (append ? [...prev, ...validTracks] : validTracks));
      setHasMoreTracks(validTracks.length === 100);
      setRetryCount(0); // Reset retry count on success
    } catch (error) {
      console.error('Error fetching tracks:', error);
      const errorMsg =
        error.message === 'HTTP error! status: 401'
          ? 'Invalid Jamendo client ID. Please verify your client ID at https://developer.jamendo.com/.'
          : `Failed to load tracks${query ? ' for search' : ''}. Please check your network or try again later.`;
      setErrorMessage(errorMsg);
      if (!isRetry && retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => fetchTracks(true, append, query), 2000);
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
      setErrorMessage('Failed to load local tracks.');
    }
  };

  // Handle pull-to-refresh
  const onRefresh = () => {
    setIsRefreshing(true);
    setPageOffset(0);
    setHasMoreTracks(true);
    setRetryCount(0);
    if (activeSegment === 'all') {
      fetchTracks(false, false, searchQuery);
    } else {
      fetchLocalTracks();
      setIsRefreshing(false);
    }
  };

  // Load more tracks on reaching end
  const loadMoreTracks = () => {
    if (isLoading || !hasMoreTracks || activeSegment !== 'all') return;
    setPageOffset(prev => prev + 100);
    fetchTracks(false, true, searchQuery);
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

  // Clear search query on segment change
  useEffect(() => {
    setSearchQuery('');
  }, [activeSegment]);

  // Handle search
  useEffect(() => {
    if (activeSegment !== 'all') {
      const data = localTracks;
      if (searchQuery.trim() === '') {
        setFilteredTracks(data);
        setErrorMessage(localTracks.length > 0 ? null : errorMessage);
      } else {
        const query = searchQuery.toLowerCase();
        const filtered = data.filter(
          (track: any) =>
            track.name.toLowerCase().includes(query) || track.artist_name.toLowerCase().includes(query)
        );
        setFilteredTracks(filtered);
        if (filtered.length === 0 && localTracks.length > 0) {
          setErrorMessage('No local tracks match your search. Try a different query.');
        } else {
          setErrorMessage(null);
        }
      }
      return;
    }

    if (searchQuery.trim() === '') {
      setPageOffset(0);
      setHasMoreTracks(true);
      setRetryCount(0);
      fetchTracks(false, false, '');
    } else {
      setPageOffset(0);
      setHasMoreTracks(true);
      setRetryCount(0);
      fetchTracks(false, false, searchQuery);
    }
  }, [searchQuery, activeSegment, localTracks]);

  // Toggle favorite status
  const toggleFavorite = (trackId: string) => {
    setFavorites((prev: any) => ({
      ...prev,
      [trackId]: !prev[trackId],
    }));
  };

  // Play or pause track
  const playTrack = async (track: any) => {
    if (!isValidTrack(track)) {
      setErrorMessage('Invalid track data. Please select another track.');
      return;
    }
    try {
      if (currentTrack?.id === track.id && isPlaying) {
        await pause();
      } else {
        await play(track, filteredTracks);
        router.push({
          pathname: '/player',
          params: {
            track: JSON.stringify(track),
            trackList: JSON.stringify(filteredTracks),
          },
        });
      }
    } catch (error) {
      setErrorMessage('Failed to play track. Please try again.');
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
    if (!isValidTrack(currentTrack)) return null;
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

  // Render error message
  const renderError = () => {
    if (!errorMessage) return null;
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={20} color="#FFF" />
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity
          onPress={() => {
            setErrorMessage(null);
            if (errorMessage.includes('tracks lack valid URLs') || errorMessage.includes('Failed to load tracks')) {
              setPageOffset(prev => prev + 100);
              fetchTracks(false, true, searchQuery);
            } else if (errorMessage.includes('No local tracks match')) {
              setSearchQuery('');
            }
          }}
        >
          <MaterialIcons
            name={
              errorMessage.includes('tracks lack valid URLs') || errorMessage.includes('Failed to load tracks')
                ? 'refresh'
                : 'close'
            }
            size={20}
            color="#FFF"
          />
        </TouchableOpacity>
      </View>
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

      {renderError()}

      {isLoading && !isRefreshing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}

      <FlatList
        data={filteredTracks}
        renderItem={renderTrack}
        keyExtractor={(item: any, index: number) => `${item.id}-${index}-${pageOffset}`}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
        onEndReached={loadMoreTracks}
        onEndReachedThreshold={0.5}
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
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EF4444',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    marginHorizontal: 8,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginHorizontal: 8,
  },
});