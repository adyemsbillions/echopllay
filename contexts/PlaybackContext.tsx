import { Audio } from 'expo-av';
import React, { createContext, useContext, useEffect, useState } from 'react';

const PlaybackContext = createContext();

export const PlaybackProvider = ({ children }) => {
  const [sound, setSound] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackLock, setPlaybackLock] = useState(false);

  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const play = async (track, trackList = [], retryCount = 0) => {
    if (!track?.audio) {
      console.warn('No audio source provided for track:', track?.name);
      return;
    }
    if (playbackLock) {
      console.log('Playback locked, skipping play for track:', track.name);
      return;
    }
    setPlaybackLock(true);
    await stop();
    const newSound = new Audio.Sound();
    try {
      const audioSource = typeof track.audio === 'string' ? { uri: track.audio } : track.audio;
      if (!audioSource.uri || !isValidUrl(audioSource.uri)) {
        throw new Error(`Invalid audio URI: ${audioSource.uri}`);
      }
      console.log('Loading audio:', audioSource.uri);
      await newSound.loadAsync(audioSource);
      setSound(newSound);
      const status = await newSound.getStatusAsync();
      if (!status.isLoaded) {
        throw new Error('Sound failed to load');
      }
      setDuration(status.durationMillis || 0);
      await newSound.playAsync();
      setIsPlaying(true);
      setPosition(0);
      setCurrentTrack({ ...track, trackList });

      newSound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded) {
          setPosition(status.positionMillis || 0);
          setDuration(status.durationMillis || 0);
          setIsPlaying(status.isPlaying);
        }
      });
    } catch (error) {
      console.error('Error playing track:', error);
      setSound(null);
      if (retryCount < 2) {
        console.log(`Retrying play (${retryCount + 1}/2) for track:`, track.name);
        setTimeout(() => {
          setPlaybackLock(false);
          play(track, trackList, retryCount + 1);
        }, 1000);
      } else {
        console.error('Failed to play track after retries:', track.name);
        setPlaybackLock(false);
      }
    } finally {
      if (!retryCount) setPlaybackLock(false);
    }
  };

  const pause = async () => {
    if (!sound) return;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('Error pausing track:', error);
    }
  };

  const resume = async () => {
    if (!sound) return;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && !isPlaying) {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error resuming track:', error);
    }
  };

  const stop = async () => {
    if (!sound) {
      setSound(null);
      setIsPlaying(false);
      setPosition(0);
      setDuration(0);
      setCurrentTrack(null);
      return;
    }
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        await sound.stopAsync();
        await sound.unloadAsync();
      } else {
        console.warn('Sound not loaded, skipping stop/unload');
      }
    } catch (error) {
      console.error('Error stopping track:', error);
    } finally {
      try {
        await sound?.unloadAsync?.();
      } catch (e) {
        console.warn('Failed to unload sound in cleanup:', e);
      }
      setSound(null);
      setIsPlaying(false);
      setPosition(0);
      setDuration(0);
      setCurrentTrack(null);
    }
  };

  const seek = async (value) => {
    if (!sound) return;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        await sound.setPositionAsync(value);
        setPosition(value);
      }
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  const playNext = async () => {
    if (!currentTrack?.trackList?.length || playbackLock) {
      console.log('No track list or playback locked, skipping playNext');
      return;
    }
    const trackIds = currentTrack.trackList.map(t => t.id);
    console.log('Track list IDs:', trackIds, 'Current track ID:', currentTrack.id);
    let currentIndex = currentTrack.trackList.findIndex(t => t.id === currentTrack.id);
    if (currentIndex === -1) {
      console.warn('Current track ID not found in track list, defaulting to index 0');
      currentIndex = 0;
    }
    if (currentIndex < currentTrack.trackList.length - 1) {
      const nextTrack = currentTrack.trackList[currentIndex + 1];
      console.log('Playing next track:', nextTrack.name);
      await play(nextTrack, currentTrack.trackList);
    } else {
      console.log('No next track available');
    }
  };

  const playPrevious = async () => {
    if (!currentTrack?.trackList?.length || playbackLock) {
      console.log('No track list or playback locked, skipping playPrevious');
      return;
    }
    const trackIds = currentTrack.trackList.map(t => t.id);
    console.log('Track list IDs:', trackIds, 'Current track ID:', currentTrack.id);
    let currentIndex = currentTrack.trackList.findIndex(t => t.id === currentTrack.id);
    if (currentIndex === -1) {
      console.warn('Current track ID not found in track list, defaulting to index 0');
      currentIndex = 0;
    }
    if (currentIndex > 0) {
      const prevTrack = currentTrack.trackList[currentIndex - 1];
      console.log('Playing previous track:', prevTrack.name);
      await play(prevTrack, currentTrack.trackList);
    } else {
      console.log('No previous track available');
    }
  };

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  return (
    <PlaybackContext.Provider
      value={{
        sound,
        currentTrack,
        isPlaying,
        position,
        duration,
        play,
        pause,
        resume,
        stop,
        seek,
        playNext,
        playPrevious,
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
};

export const usePlayback = () => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
};