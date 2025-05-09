import { Audio } from 'expo-av';
import React, { createContext, useContext, useEffect, useState } from 'react';

const PlaybackContext = createContext();

export const PlaybackProvider = ({ children }) => {
  const [sound, setSound] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const play = async (track, trackList = []) => {
    if (!track?.audio) return;
    await stop(); // Stop and unload current sound
    const newSound = new Audio.Sound();
    try {
      const audioSource = typeof track.audio === 'string' ? { uri: track.audio } : track.audio;
      if (!audioSource.uri) throw new Error('Invalid audio URI');
      await newSound.loadAsync(audioSource);
      setSound(newSound);
      const status = await newSound.getStatusAsync();
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
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (error) {
        console.error('Error stopping track:', error);
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
      await sound.setPositionAsync(value);
      setPosition(value);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  const playNext = async () => {
    if (!currentTrack?.trackList?.length) return;
    const currentIndex = currentTrack.trackList.findIndex(t => t.id === currentTrack.id);
    if (currentIndex < currentTrack.trackList.length - 1) {
      const nextTrack = currentTrack.trackList[currentIndex + 1];
      await play(nextTrack, currentTrack.trackList);
    }
  };

  const playPrevious = async () => {
    if (!currentTrack?.trackList?.length) return;
    const currentIndex = currentTrack.trackList.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
      const prevTrack = currentTrack.trackList[currentIndex - 1];
      await play(prevTrack, currentTrack.trackList);
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