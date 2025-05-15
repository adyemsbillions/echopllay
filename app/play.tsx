
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import {
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
async function getOnlineTracks(offset = 0, limit = 100, searchQuery = '', genres = []) {
  try {
    const clientId = 'a31365c7';
    const queryParam = searchQuery ? `&namesearch=${encodeURIComponent(searchQuery)}` : '';
    const genreParam = genres.length > 0 ? `&tags=${encodeURIComponent(genres.join('+'))}` : '';
    const endpoint = `/tracks/?client_id=${clientId}&format=json&limit=${limit}&offset=${offset}&order=downloads_total${queryParam}${genreParam}`;
    const data = await fetchWebApi(endpoint);
    console.log('Jamendo tracks response:', {
      offset,
      searchQuery,
      genres,
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
  const { play, pause, isPlaying, currentTrack } = usePlayback();
  const [tracks, setTracks] = useState([]);
  const [localTracks, setLocalTracks] = useState([]);
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [isConnected, setIsConnected] = useState(true);
  const [activeSegment, setActiveSegment] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [favorites, setFavorites] = useState({});
  const [hasPermission, setHasPermission] = useState(null);
  const [pageOffset, setPageOffset] = useState(0);
  const [hasMoreTracks, setHasMoreTracks] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState('');
  const RATE_LIMIT_BACKOFF = 5000;

  const searchTimeoutRef = useRef(null);
  const updateTimeoutRef = useRef(null);
  const fetchRef = useRef(false); // Prevent concurrent fetches

  const GENRES = ['gospel', 'afrobeat', 'rap', 'pop', 'rock', 'jazz', 'classical', 'reggae'];
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

  // Cache tracks to AsyncStorage
  const cacheTracks = async (newTracks: any[]) => {
    try {
      const cached = await AsyncStorage.getItem('cachedTracks');
      const existing = cached ? JSON.parse(cached) : [];
      const updated = [...existing, ...newTracks].filter(
        (track, index, self) => self.findIndex(t => t.id === track.id) === index
      );
      await AsyncStorage.setItem('cachedTracks', JSON.stringify(updated));
      console.log('Cached tracks:', updated.length);
    } catch (error) {
      console.error('Error caching tracks:', error);
    }
  };

  // Load cached tracks
  const loadCachedTracks = async (query = '', genres = []) => {
    try {
      const cached = await AsyncStorage.getItem('cachedTracks');
      if (cached) {
        const allTracks = JSON.parse(cached);
        let filtered = allTracks;
        if (query) {
          const q = query.toLowerCase();
          filtered = allTracks.filter(
            (track: any) =>
              track.name.toLowerCase().includes(q) || track.artist_name.toLowerCase().includes(q)
          );
        }
        if (genres.length > 0) {
          filtered = filtered.filter((track: any) =>
            genres.some(genre => track.name.toLowerCase().includes(genre) || track.artist_name.toLowerCase().includes(genre))
          );
        }
        setTracks(filtered);
        setFilteredTracks(filtered);
        console.log('Loaded cached tracks:', filtered.length);
        return filtered.length > 0;
      }
    } catch (error) {
      console.error('Error loading cached tracks:', error);
    }
    return false;
  };

  // Clear cache
  const clearCache = async () => {
    try {
      await AsyncStorage.removeItem('cachedTracks');
      console.log('Cache cleared');
      setTracks([]);
      setFilteredTracks([]);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };

  // Debounce search input
  const debounceSearch = (query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(query);
    }, 500);
  };

  // Debounce track updates
  const debounceTrackUpdate = (newTracks: any[]) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      console.log('Updating tracks:', newTracks.length);
      setTracks(newTracks);
      setFilteredTracks(newTracks);
    }, 300);
  };

  // Request media library permissions
  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Fetch online tracks
  const fetchTracks = async (append = false, query = '', genres = []) => {
    if (!isConnected) {
      await loadCachedTracks(query, genres);
      return;
    }
    if (fetchRef.current) return;
    fetchRef.current = true;

    try {
      let onlineTracks = await getOnlineTracks(pageOffset, 100, query, genres);
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

      await cacheTracks(validTracks);
      const newTracks = append ? [...tracks, ...validTracks] : validTracks;
      debounceTrackUpdate(newTracks);
      setHasMoreTracks(validTracks.length === 100);
    } catch (error) {
      console.error('Error fetching tracks:', error);
      if (error.message.includes('status: 429')) {
        setTimeout(() => {
          fetchRef.current = false;
          fetchTracks(append, query, genres);
        }, RATE_LIMIT_BACKOFF);
      }
      await loadCachedTracks(query, genres);
    } finally {
      fetchRef.current = false;
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
        first: 100,
      });
      const localTracks = assets.map((asset: any) => ({
        id: asset.id,
        name: asset.filename || 'Unknown Track',
        artist_name: asset.filename?.split('-')[0]?.trim() || 'Unknown Artist',
        duration: asset.duration || 0,
        audio: { uri: asset.uri },
        image: null,
        isPreview: false,
      }));
      
      setLocalTracks(localTracks);
      setFilteredTracks(localTracks);
    } catch (error) {
      console.error('Error fetching local tracks:', error);
    }
  };

  // Handle pull-to-refresh
  const onRefresh = () => {
    setIsRefreshing(true);
    setPageOffset(0);
    setHasMoreTracks(true);
    if (activeSegment === 'all') {
      fetchTracks(false, searchQuery, selectedGenre ? [selectedGenre] : GENRES);
    } else {
      fetchLocalTracks();
      setIsRefreshing(false);
    }
  };

  // Load more tracks on reaching end
  const loadMoreTracks = () => {
    if (fetchRef.current || !hasMoreTracks || activeSegment !== 'all') return;
    setPageOffset(prev => prev + 100);
    fetchTracks(true, searchQuery, selectedGenre ? [selectedGenre] : GENRES);
  };

  // Initial data fetch (run once)
  useEffect(() => {
    fetchTracks(false, '', GENRES);
    fetchLocalTracks();
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    };
  }, []);

  // Network monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  // Clear search query and genre on segment change
  useEffect(() => {
    setSearchQuery('');
    setSelectedGenre('');
  }, [activeSegment]);

  // Handle search and genre filtering
  useEffect(() => {
    if (activeSegment !== 'all') {
      const data = localTracks;
      if (searchQuery.trim() === '') {
        setFilteredTracks(data);
      } else {
        const query = searchQuery.toLowerCase();
        const filtered = data.filter(
          (track: any) =>
            track.name.toLowerCase().includes(query) || track.artist_name.toLowerCase().includes(query)
        );
        setTracks(filtered);
        setFilteredTracks(filtered);
      }
      return;
    }

    const isGenreQuery = GENRES.includes(searchQuery.toLowerCase());
    if (searchQuery.trim() === '' && !selectedGenre) {
      setPageOffset(0);
      setHasMoreTracks(true);
      fetchTracks(false, '', GENRES);
    } else {
      setPageOffset(0);
      setHasMoreTracks(true);
      const genres = isGenreQuery ? [searchQuery.toLowerCase()] : selectedGenre ? [selectedGenre] : [];
      fetchTracks(false, isGenreQuery ? '' : searchQuery, genres);
    }
  }, [searchQuery, selectedGenre, activeSegment, localTracks]);

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
      console.error('Error playing track:', error);
    }
  };

  // Optimized renderTrack with memo
  const RenderTrack = memo(
    ({ item }: { item: any }) => {
      return (
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
    },
    (prevProps, nextProps) =>
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.name === nextProps.item.name &&
      prevProps.item.artist_name === nextProps.item.artist_name
  );

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render genre buttons
  const renderGenreButtons = () => (
    <View style={styles.genreContainer}>
      {GENRES.map(genre => (
        <TouchableOpacity
          key={genre}
          style={[
            styles.genreButton,
            selectedGenre === genre && styles.activeGenreButton,
          ]}
          onPress={() => setSelectedGenre(genre === selectedGenre ? '' : genre)}
        >
          <Text
            style={[
              styles.genreText,
              selectedGenre === genre && styles.activeGenreText,
            ]}
          >
            {genre.charAt(0).toUpperCase() + genre.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Render song count
  const renderSongCount = () => {
    if (filteredTracks.length === 0) return null;
    const filterText = selectedGenre
      ? selectedGenre.charAt(0).toUpperCase() + selectedGenre.slice(1)
      : searchQuery
      ? `"${searchQuery}"`
      : 'All Genres';
    return (
      <Text style={styles.songCount}>
        Showing {filteredTracks.length} song{filteredTracks.length !== 1 ? 's' : ''} for {filterText}
      </Text>
    );
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

  return (
    <LinearGradient colors={['#111827', '#1F2937']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>EchoPlay</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search songs, artists, or genres..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={debounceSearch}
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

      {activeSegment === 'all' && renderGenreButtons()}

      {!isConnected && (
        <View style={styles.offlineWarning}>
          <MaterialIcons name="signal-wifi-off" size={20} color="#FFF" />
          <Text style={styles.offlineText}>Offline Mode - Showing local tracks only</Text>
        </View>
      )}

      {renderSongCount()}

      <FlatList
        data={filteredTracks}
        renderItem={({ item }) => <RenderTrack item={item} />}
        keyExtractor={(item: any, index: number) => `${item.id}-${index}-${pageOffset}`}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
        onEndReached={loadMoreTracks}
        onEndReachedThreshold={0.5}
        getItemLayout={(data, index) => ({
          length: 96,
          offset: 96 * index,
          index,
        })}
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

      {activeSegment === 'all' && (
        <TouchableOpacity style={styles.clearCacheButton} onPress={clearCache}>
          <Text style={styles.clearCacheText}>Clear Cache</Text>
        </TouchableOpacity>
      )}
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
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 16,
  },
  genreButton: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    margin: 4,
  },
  activeGenreButton: {
    backgroundColor: '#F97316',
  },
  genreText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '500',
  },
  activeGenreText: {
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
  songCount: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
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
  clearCacheButton: {
    backgroundColor: '#374151',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  clearCacheText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
