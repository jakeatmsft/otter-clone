'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDefaultTranscriptTitle } from '@/lib/transcript-title';
import RightPanel from '../components/layout/RightPanel';

const DEFAULT_REALTIME_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;
const MEDIA_RECORDER_TIMESLICE_MS = 1000;
const REALTIME_FINALIZATION_TIMEOUT_MS = 4000;
const RECORDING_MIME_TYPE_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function formatClockDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatHumanDuration(totalSeconds: number) {
  if (totalSeconds < 60) {
    return `${Math.max(1, totalSeconds)} sec`;
  }

  const mins = Math.floor(totalSeconds / 60);
  return `${mins} min`;
}

function sanitizeFilenamePart(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'recording';
}

function getPreferredRecordingMimeType() {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof MediaRecorder.isTypeSupported !== 'function'
  ) {
    return '';
  }

  return (
    RECORDING_MIME_TYPE_CANDIDATES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    ) || ''
  );
}

function getRecordingFileExtension(mimeType: string) {
  const normalized = mimeType.split(';', 1)[0]?.trim().toLowerCase() || '';

  if (normalized === 'audio/mp4') {
    return 'm4a';
  }

  if (normalized === 'audio/ogg') {
    return 'ogg';
  }

  return 'webm';
}

function waitForValueOrTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
) {
  return new Promise<T>((resolve) => {
    const timeout = setTimeout(() => {
      resolve(fallbackValue);
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(fallbackValue);
      });
  });
}

function getRealtimeSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/realtime-transcription`;
}

function normalizeError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Microphone or screen-audio permission was denied.';
    }
    if (error.name === 'NotFoundError') {
      return 'The selected audio input device was not found.';
    }
    if (error.name === 'NotReadableError') {
      return 'The selected audio device is already in use by another app.';
    }
    return error.message || 'Browser media permission failed.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected audio capture error occurred.';
}

function encodePcm16Chunk(
  float32Samples: Float32Array,
  inputRate: number,
  targetSampleRate: number
) {
  if (inputRate <= 0 || targetSampleRate <= 0) {
    return '';
  }

  const sampleRateRatio = inputRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(float32Samples.length / sampleRateRatio));
  const pcm16 = new Int16Array(outputLength);
  let inputOffset = 0;

  for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
    const nextInputOffset = Math.min(
      float32Samples.length,
      Math.round((outputOffset + 1) * sampleRateRatio)
    );

    let total = 0;
    let count = 0;

    for (let i = inputOffset; i < nextInputOffset; i += 1) {
      total += float32Samples[i];
      count += 1;
    }

    const sample = count > 0 ? total / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm16[outputOffset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    inputOffset = nextInputOffset;
  }

  let binary = '';
  const bytes = new Uint8Array(pcm16.buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window.btoa(binary);
}

type RealtimeFinalization = {
  reject: (error: Error) => void;
  resolve: (transcript: string) => void;
};

type RecordedAudio = {
  blob: Blob;
  extension: string;
  mimeType: string;
};

type RawTranscriptSegment = {
  end?: number;
  start?: number;
  text?: string;
};

type SavedTranscriptSegment = {
  speaker: string;
  timestamp: string;
  text: string;
};

type RealtimeServerMessage =
  | { type: 'error'; error?: string }
  | { type: 'session.finalized'; fullTranscript?: string }
  | { type: 'session.ready'; sampleRate?: number }
  | { type: 'speech.started' }
  | { type: 'speech.stopped' }
  | { type: 'transcript.updated'; fullTranscript?: string; isFinal?: boolean };

export default function RecordPage() {
  const router = useRouter();
  const initialDefaultTitle = useRef(createDefaultTranscriptTitle());

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [includeLoopback, setIncludeLoopback] = useState(false);
  const [noteTitle, setNoteTitle] = useState(initialDefaultTitle.current);
  const [statusMessage, setStatusMessage] = useState('Ready to record');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewTranscript, setPreviewTranscript] = useState('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const durationRef = useRef(0);
  const finalizationRef = useRef<RealtimeFinalization | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef('');
  const realtimeSampleRateRef = useRef(DEFAULT_REALTIME_SAMPLE_RATE);
  const silentGainRef = useRef<GainNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const transcriptRef = useRef('');
  const streamingAudioRef = useRef(false);
  const autoTitleRef = useRef(initialDefaultTitle.current);

  const selectedDeviceLabel = useMemo(() => {
    const current = audioInputs.find((device) => device.deviceId === selectedInputId);
    return current?.label || 'Default microphone';
  }, [audioInputs, selectedInputId]);

  const buildRecordedAudio = useCallback((mimeTypeHint?: string) => {
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];

    if (!chunks.length) {
      throw new Error('Recorded audio was empty.');
    }

    const mimeType = mimeTypeHint || recordingMimeTypeRef.current || chunks[0]?.type || 'audio/webm';
    recordingMimeTypeRef.current = '';

    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) {
      throw new Error('Recorded audio was empty.');
    }

    const resolvedMimeType = blob.type || mimeType || 'audio/webm';

    return {
      blob,
      extension: getRecordingFileExtension(resolvedMimeType),
      mimeType: resolvedMimeType,
    };
  }, []);

  const discardLocalRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    recordingMimeTypeRef.current = '';

    if (!recorder || recorder.state === 'inactive') {
      return;
    }

    recorder.ondataavailable = null;
    try {
      recorder.stop();
    } catch {
      // Ignore teardown errors while discarding a partial recording.
    }
  }, []);

  const finalizeLocalRecording = useCallback(() => {
    return new Promise<RecordedAudio>((resolve, reject) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder) {
        try {
          resolve(buildRecordedAudio());
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('Failed to finalize the local audio recording.')
          );
        }
        return;
      }

      const handleStop = () => {
        cleanupRecorderListeners();
        mediaRecorderRef.current = null;

        try {
          resolve(buildRecordedAudio(recorder.mimeType));
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('Failed to finalize the local audio recording.')
          );
        }
      };

      const handleError = () => {
        cleanupRecorderListeners();
        mediaRecorderRef.current = null;
        reject(new Error('Failed to finalize the local audio recording.'));
      };

      const cleanupRecorderListeners = () => {
        recorder.removeEventListener('stop', handleStop);
        recorder.removeEventListener('error', handleError);
      };

      recorder.addEventListener('stop', handleStop, { once: true });
      recorder.addEventListener('error', handleError, { once: true });

      if (recorder.state === 'inactive') {
        handleStop();
        return;
      }

      try {
        recorder.stop();
      } catch (error) {
        cleanupRecorderListeners();
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to stop the local audio recording.')
        );
      }
    });
  }, [buildRecordedAudio]);

  const cleanupRealtimeSocket = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    streamingAudioRef.current = false;

    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      socket.close();
    }
  }, []);

  const refreshAudioInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setErrorMessage('This browser does not support audio input selection.');
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === 'audioinput');
    setAudioInputs(inputs);

    if (!inputs.length) {
      setSelectedInputId('');
      return;
    }

    const hasSelected = inputs.some((device) => device.deviceId === selectedInputId);
    if (!selectedInputId || !hasSelected) {
      const defaultInput =
        inputs.find((device) => device.deviceId === 'default') || inputs[0];
      setSelectedInputId(defaultInput.deviceId);
    }
  }, [selectedInputId]);

  const cleanupMedia = useCallback(async () => {
    const stopTracks = (stream: MediaStream | null) => {
      if (!stream) {
        return;
      }

      stream.getTracks().forEach((track) => track.stop());
    };

    stopTracks(micStreamRef.current);
    stopTracks(displayStreamRef.current);

    micStreamRef.current = null;
    displayStreamRef.current = null;

    processorRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    processorRef.current = null;
    silentGainRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const waitForFinalTranscript = useCallback(() => {
    return new Promise<string>((resolve, reject) => {
      finalizationRef.current = { resolve, reject };
    });
  }, []);

  const uploadRecordedAudio = useCallback(
    async (recordedAudio: RecordedAudio) => {
      setStatusMessage('Uploading full recording...');
      const title = noteTitle.trim() || autoTitleRef.current;
      const filename = `${sanitizeFilenamePart(title)}.${recordedAudio.extension}`;
      const uploadForm = new FormData();
      uploadForm.append('file', recordedAudio.blob, filename);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm,
      });
      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadData.filename) {
        throw new Error(uploadData.error || 'Failed to upload the recorded audio.');
      }

      return String(uploadData.filename);
    },
    [noteTitle]
  );

  const transcribeUploadedAudio = useCallback(async (audioFilename: string) => {
    setStatusMessage('Transcribing full recording...');
    const transcribeResponse = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: audioFilename }),
    });
    const transcribeData = await transcribeResponse.json();

    if (!transcribeResponse.ok) {
      throw new Error(transcribeData.error || 'Transcription failed.');
    }

    const transcript = String(transcribeData.transcript || '').trim();
    const rawSegments = Array.isArray(transcribeData.segments)
      ? (transcribeData.segments as RawTranscriptSegment[])
      : [];

    const segments: SavedTranscriptSegment[] = rawSegments.map((segment) => ({
      speaker: 'Speaker 1',
      timestamp: formatClockDuration(Math.round(segment.start || 0)),
      text: segment.text || '',
    }));

    const derivedDurationSeconds = Math.round(
      rawSegments.reduce(
        (max, segment) => Math.max(max, segment.end || segment.start || 0),
        0
      )
    );

    return {
      durationSeconds:
        typeof transcribeData.durationSeconds === 'number'
          ? Math.max(1, Math.round(transcribeData.durationSeconds))
          : derivedDurationSeconds > 0
            ? Math.max(1, derivedDurationSeconds)
            : undefined,
      segments,
      transcript,
    };
  }, []);

  const saveTranscriptWithAudio = useCallback(
    async ({
      audioFilename,
      durationSeconds,
      segments,
      transcript,
    }: {
      audioFilename: string;
      durationSeconds: number;
      segments: SavedTranscriptSegment[];
      transcript: string;
    }) => {
      setStatusMessage('Saving transcript and audio...');
      const title = noteTitle.trim() || createDefaultTranscriptTitle();

      const saveResponse = await fetch('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioFilename,
          title,
          transcript,
          duration: formatHumanDuration(durationSeconds),
          speakers: [{ name: 'Speaker 1', percentage: 100 }],
          segments,
        }),
      });
      const saveData = await saveResponse.json();

      if (!saveResponse.ok || !saveData.id) {
        throw new Error(saveData.error || 'Failed to save transcript.');
      }

      setStatusMessage('Saved. Opening transcript...');
      router.push(`/transcripts/${saveData.id}`);
    },
    [noteTitle, router]
  );

  const openRealtimeSocket = useCallback(() => {
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(getRealtimeSocketUrl());
      let readyResolved = false;

      socket.addEventListener('message', (event) => {
        let message: RealtimeServerMessage;

        try {
          message = JSON.parse(event.data);
        } catch (error) {
          const parseError = new Error('Received malformed realtime transcription data.');
          if (!readyResolved) {
            reject(parseError);
          }
          setErrorMessage(parseError.message);
          return;
        }

        if (message.type === 'session.ready') {
          realtimeSampleRateRef.current =
            typeof message.sampleRate === 'number' && message.sampleRate > 0
              ? message.sampleRate
              : DEFAULT_REALTIME_SAMPLE_RATE;
          readyResolved = true;
          setStatusMessage(
            includeLoopback
              ? 'Recording microphone and loopback audio with live transcription.'
              : 'Recording microphone audio with live transcription.'
          );
          resolve(socket);
          return;
        }

        if (message.type === 'speech.started') {
          setStatusMessage('Listening... speech detected.');
          return;
        }

        if (message.type === 'speech.stopped') {
          setStatusMessage('Waiting for the next phrase...');
          return;
        }

        if (message.type === 'transcript.updated') {
          const transcript = typeof message.fullTranscript === 'string' ? message.fullTranscript : '';
          transcriptRef.current = transcript;
          setPreviewTranscript(transcript);
          return;
        }

        if (message.type === 'session.finalized') {
          const transcript =
            typeof message.fullTranscript === 'string'
              ? message.fullTranscript.trim()
              : transcriptRef.current.trim();
          const pending = finalizationRef.current;
          finalizationRef.current = null;
          pending?.resolve(transcript);
          return;
        }

        if (message.type === 'error') {
          const realtimeError = new Error(message.error || 'Realtime transcription failed.');
          if (!readyResolved) {
            reject(realtimeError);
          }
          const pending = finalizationRef.current;
          finalizationRef.current = null;
          pending?.reject(realtimeError);
          setStatusMessage('Realtime transcription failed.');
          setErrorMessage(realtimeError.message);
        }
      });

      socket.addEventListener('close', () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        const pending = finalizationRef.current;
        if (pending) {
          finalizationRef.current = null;
          pending.reject(
            new Error('Realtime transcription connection closed before the transcript was finalized.')
          );
        } else if (!readyResolved) {
          reject(
            new Error('Realtime transcription connection closed before it became ready.')
          );
        }
      });

      socket.addEventListener('error', () => {
        const connectionError = new Error('Failed to connect to the realtime transcription service.');
        if (!readyResolved) {
          reject(connectionError);
        }
        const pending = finalizationRef.current;
        finalizationRef.current = null;
        pending?.reject(connectionError);
        setStatusMessage('Realtime transcription failed.');
        setErrorMessage(connectionError.message);
      });
    });
  }, [includeLoopback]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRecording, isPaused]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    refreshAudioInputs().catch((error) => {
      setErrorMessage(normalizeError(error));
    });

    const handleDeviceChange = () => {
      refreshAudioInputs().catch((error) => {
        setErrorMessage(normalizeError(error));
      });
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
      cleanupRealtimeSocket();
      discardLocalRecording();
      cleanupMedia().catch(() => undefined);
      const pending = finalizationRef.current;
      finalizationRef.current = null;
      pending?.reject(new Error('Realtime transcription session was interrupted.'));
    };
  }, [cleanupMedia, cleanupRealtimeSocket, discardLocalRecording, refreshAudioInputs]);

  const handleStart = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('This browser does not support microphone capture.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setErrorMessage('This browser does not support local audio recording.');
      return;
    }

    if (!noteTitle.trim() || noteTitle === autoTitleRef.current) {
      const nextAutoTitle = createDefaultTranscriptTitle();
      autoTitleRef.current = nextAutoTitle;
      setNoteTitle(nextAutoTitle);
    }

    setErrorMessage('');
    setPreviewTranscript('');
    setDuration(0);
    setIsPreparing(true);
    setStatusMessage('Requesting microphone access...');
    realtimeSampleRateRef.current = DEFAULT_REALTIME_SAMPLE_RATE;
    transcriptRef.current = '';

    try {
      const micConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      if (selectedInputId && selectedInputId !== 'default') {
        micConstraints.deviceId = { exact: selectedInputId };
      }

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: micConstraints,
      });
      micStreamRef.current = micStream;

      await refreshAudioInputs();

      let loopbackAudioStream: MediaStream | null = null;

      if (includeLoopback) {
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error('Loopback capture is not supported in this browser.');
        }

        setStatusMessage(
          'Select a tab/window and enable "share audio" to capture output audio.'
        );

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        displayStreamRef.current = displayStream;

        const displayAudioTracks = displayStream.getAudioTracks();
        if (!displayAudioTracks.length) {
          throw new Error(
            'No loopback audio track was provided. Re-start and enable audio sharing.'
          );
        }

        displayStream.getVideoTracks().forEach((track) => track.stop());
        loopbackAudioStream = new MediaStream(displayAudioTracks);
      }

      const BrowserAudioContext =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!BrowserAudioContext) {
        throw new Error('AudioContext is not available in this browser.');
      }

      const audioContext = new BrowserAudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const mixBus = audioContext.createGain();
      const recordingDestination = audioContext.createMediaStreamDestination();
      const processor = audioContext.createScriptProcessor(
        SCRIPT_PROCESSOR_BUFFER_SIZE,
        1,
        1
      );
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      const micSource = audioContext.createMediaStreamSource(micStream);
      const micGain = audioContext.createGain();
      micGain.gain.value = 1;
      micSource.connect(micGain).connect(mixBus);

      if (loopbackAudioStream) {
        const loopbackSource = audioContext.createMediaStreamSource(loopbackAudioStream);
        const loopbackGain = audioContext.createGain();
        loopbackGain.gain.value = 1;
        loopbackSource.connect(loopbackGain).connect(mixBus);
      }

      mixBus.connect(recordingDestination);

      const preferredMimeType = getPreferredRecordingMimeType();
      const mediaRecorder = preferredMimeType
        ? new MediaRecorder(recordingDestination.stream, {
            mimeType: preferredMimeType,
          })
        : new MediaRecorder(recordingDestination.stream);

      recordedChunksRef.current = [];
      recordingMimeTypeRef.current =
        mediaRecorder.mimeType || preferredMimeType || 'audio/webm';
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.start(MEDIA_RECORDER_TIMESLICE_MS);
      mediaRecorderRef.current = mediaRecorder;

      setStatusMessage('Connecting realtime transcription...');
      const socket = await openRealtimeSocket();
      socketRef.current = socket;

      processor.onaudioprocess = (event) => {
        if (!streamingAudioRef.current) {
          return;
        }

        const activeSocket = socketRef.current;
        if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
          return;
        }

        const audioChunk = encodePcm16Chunk(
          event.inputBuffer.getChannelData(0),
          audioContext.sampleRate,
          realtimeSampleRateRef.current
        );

        if (!audioChunk) {
          return;
        }

        activeSocket.send(
          JSON.stringify({
            type: 'audio.append',
            audio: audioChunk,
          })
        );
      };

      mixBus.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      processorRef.current = processor;
      silentGainRef.current = silentGain;
      streamingAudioRef.current = true;
      setIsPaused(false);
      setIsRecording(true);
    } catch (error) {
      cleanupRealtimeSocket();
      discardLocalRecording();
      await cleanupMedia();
      setIsRecording(false);
      setIsPaused(false);
      setIsProcessing(false);
      setStatusMessage('Ready to record');
      setErrorMessage(normalizeError(error));
    } finally {
      setIsPreparing(false);
    }
  }, [
    cleanupMedia,
    cleanupRealtimeSocket,
    discardLocalRecording,
    includeLoopback,
    noteTitle,
    openRealtimeSocket,
    refreshAudioInputs,
    selectedInputId,
  ]);

  const handlePause = useCallback(() => {
    if (!isRecording) {
      return;
    }

    if (isPaused) {
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === 'paused') {
        recorder.resume();
      }
      streamingAudioRef.current = true;
      setIsPaused(false);
      setStatusMessage('Recording resumed.');
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.pause();
    }
    streamingAudioRef.current = false;
    setIsPaused(true);
    setStatusMessage('Recording paused.');
  }, [isPaused, isRecording]);

  const handleStop = useCallback(async () => {
    if (!isRecording) {
      return;
    }

    const socket = socketRef.current;
    const fallbackRealtimeTranscript = transcriptRef.current.trim();
    let realtimeTranscriptPromise = Promise.resolve(fallbackRealtimeTranscript);

    setIsRecording(false);
    setIsPaused(false);
    setIsProcessing(true);
    streamingAudioRef.current = false;

    try {
      if (socket && socket.readyState === WebSocket.OPEN) {
        realtimeTranscriptPromise = waitForFinalTranscript();
        socket.send(JSON.stringify({ type: 'audio.stop' }));
        setStatusMessage('Finalizing realtime preview...');
      } else {
        setStatusMessage('Finishing recording from the saved audio...');
      }

      const recordedAudio = await finalizeLocalRecording();
      await cleanupMedia();

      const realtimeTranscript = (
        await waitForValueOrTimeout(
          realtimeTranscriptPromise,
          REALTIME_FINALIZATION_TIMEOUT_MS,
          fallbackRealtimeTranscript
        )
      ).trim();
      cleanupRealtimeSocket();

      if (realtimeTranscript) {
        transcriptRef.current = realtimeTranscript;
        setPreviewTranscript(realtimeTranscript);
      }

      const audioFilename = await uploadRecordedAudio(recordedAudio);
      let finalTranscript = realtimeTranscript;
      let segments: SavedTranscriptSegment[] = [];
      let durationSeconds = Math.max(1, durationRef.current);

      try {
        const batchTranscription = await transcribeUploadedAudio(audioFilename);

        if (batchTranscription.transcript) {
          finalTranscript = batchTranscription.transcript;
          transcriptRef.current = batchTranscription.transcript;
          setPreviewTranscript(batchTranscription.transcript);
        }

        segments = batchTranscription.segments;
        if (typeof batchTranscription.durationSeconds === 'number') {
          durationSeconds = batchTranscription.durationSeconds;
        }
      } catch (error) {
        if (!finalTranscript) {
          throw error;
        }
      }

      if (!finalTranscript) {
        throw new Error('No transcription text was returned from the recorded audio.');
      }

      await saveTranscriptWithAudio({
        audioFilename,
        durationSeconds,
        segments,
        transcript: finalTranscript,
      });
    } catch (error) {
      discardLocalRecording();
      await cleanupMedia();
      cleanupRealtimeSocket();
      setStatusMessage('Recording ended, but saving failed.');
      setErrorMessage(normalizeError(error));
      setIsProcessing(false);
    }
  }, [
    cleanupMedia,
    cleanupRealtimeSocket,
    discardLocalRecording,
    finalizeLocalRecording,
    isRecording,
    saveTranscriptWithAudio,
    transcribeUploadedAudio,
    uploadRecordedAudio,
    waitForFinalTranscript,
  ]);

  const canStart = !isRecording && !isPreparing && !isProcessing;
  const recordingTitle = noteTitle.trim() || autoTitleRef.current;

  const displayedInputs = useMemo(
    () =>
      audioInputs.map((device, index) => ({
        id: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      })),
    [audioInputs]
  );

  const startButtonLabel = (() => {
    if (isPreparing) {
      return 'Preparing...';
    }
    if (isProcessing) {
      return 'Saving...';
    }
    return 'Start Realtime Recording';
  })();

  return (
    <>
      <div className="pr-80 pb-28">
        <div className="border-b border-slate-200 bg-white px-8 py-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="max-w-5xl">
            <h1 className="mb-3 text-3xl font-bold text-slate-900 dark:text-slate-100">Record</h1>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Capture audio with a live transcript preview, then save the full recording for
              playback.
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="max-w-5xl space-y-6">
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Title</span>
                  <input
                    value={noteTitle}
                    onChange={(event) => setNoteTitle(event.target.value)}
                    disabled={isRecording || isProcessing}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800"
                    placeholder={autoTitleRef.current}
                  />
                </label>

                <label className="block min-w-0">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Audio input source</span>
                  <div className="mt-1 flex min-w-0 gap-2">
                    <select
                      value={selectedInputId}
                      onChange={(event) => setSelectedInputId(event.target.value)}
                      disabled={isRecording || isProcessing || isPreparing || !displayedInputs.length}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                    >
                      {displayedInputs.length === 0 ? (
                        <option value="">No microphone detected</option>
                      ) : (
                        displayedInputs.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.label}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        refreshAudioInputs().catch((error) => {
                          setErrorMessage(normalizeError(error));
                        });
                      }}
                      disabled={isRecording || isProcessing || isPreparing}
                      className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                    >
                      Refresh
                    </button>
                  </div>
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={includeLoopback}
                  onChange={(event) => setIncludeLoopback(event.target.checked)}
                  disabled={isRecording || isProcessing || isPreparing}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Include output loopback audio
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    On start, the browser will ask you to share a tab/window/screen. Enable
                    audio sharing to capture system output.
                  </div>
                </div>
              </label>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Current input:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">{selectedDeviceLabel}</span>
              </div>
            </div>

            {!isRecording ? (
              <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 text-5xl">Audio</div>
                <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{recordingTitle}</h2>
                <p className="mx-auto mb-8 max-w-xl px-4 text-slate-600 dark:text-slate-400">
                  {isProcessing
                    ? 'Finishing the full recording and saving the final transcript.'
                    : 'Choose your input source and start recording when you are ready.'}
                </p>
                <button
                  onClick={handleStart}
                  disabled={!canStart || !displayedInputs.length}
                  className="inline-flex items-center gap-3 rounded-lg bg-blue-500 px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-blue-600 disabled:bg-blue-300"
                >
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  {startButtonLabel}
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-6 text-center text-slate-600 dark:text-slate-400">
                  {includeLoopback
                    ? 'Streaming microphone and loopback audio into the live transcript preview while saving the full recording.'
                    : 'Streaming microphone audio into the live transcript preview while saving the full recording.'}
                </div>
                <div className="text-center font-mono text-4xl text-slate-900 dark:text-slate-100">
                  {formatClockDuration(duration)}
                </div>
              </div>
            )}

            {(statusMessage || errorMessage || previewTranscript) && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">Status:</span> {statusMessage}
                </div>

                {errorMessage && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    {errorMessage}
                  </div>
                )}

                {previewTranscript && (
                  <div>
                    <div className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Live transcript
                    </div>
                    <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {previewTranscript}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isRecording && (
        <div className="fixed bottom-0 left-60 right-0 z-20 border-t border-slate-200 bg-white px-8 py-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-5xl items-center gap-6">
            <button
              onClick={handlePause}
              className="rounded-full bg-slate-100 p-4 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <svg className="h-6 w-6 text-slate-700 dark:text-slate-200" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg
                  className="h-6 w-6 text-slate-700 dark:text-slate-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 9v6m4-6v6"
                  />
                </svg>
              )}
            </button>

            <button
              onClick={() => {
                handleStop().catch((error) => {
                  setErrorMessage(normalizeError(error));
                });
              }}
              className="rounded-full bg-red-500 p-4 transition-colors hover:bg-red-600"
              title="Stop"
            >
              <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>

            <div className="flex flex-1 items-center gap-4">
              <div className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-full ${
                    isPaused ? 'bg-yellow-500' : 'animate-pulse bg-red-500'
                  }`}
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {isPaused ? 'Paused' : 'Recording'}
                </span>
              </div>

              <div className="h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isPaused ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: '100%' }}
                />
              </div>

              <span className="min-w-[4rem] font-mono text-sm text-slate-700 dark:text-slate-200">
                {formatClockDuration(duration)}
              </span>
            </div>
          </div>
        </div>
      )}

      <RightPanel />
    </>
  );
}
