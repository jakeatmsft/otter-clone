'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import RightPanel from '../components/layout/RightPanel';

const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
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

function getPreferredMimeType() {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return '';
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

type WhisperSegment = {
  start?: number;
  text?: string;
};

export default function RecordPage() {
  const router = useRouter();

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [includeLoopback, setIncludeLoopback] = useState(false);
  const [noteTitle, setNoteTitle] = useState('Untitled recording');
  const [statusMessage, setStatusMessage] = useState('Ready to record');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewTranscript, setPreviewTranscript] = useState('');
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const durationRef = useRef(0);

  const selectedDeviceLabel = useMemo(() => {
    const current = audioInputs.find((device) => device.deviceId === selectedInputId);
    return current?.label || 'Default microphone';
  }, [audioInputs, selectedInputId]);

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
    stopTracks(mixedStreamRef.current);

    micStreamRef.current = null;
    displayStreamRef.current = null;
    mixedStreamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const processRecording = useCallback(
    async (audioBlob: Blob, durationSeconds: number) => {
      setIsProcessing(true);
      setStatusMessage('Uploading recording...');
      setErrorMessage('');

      const extension = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
      const recordingFile = new File(
        [audioBlob],
        `recording-${Date.now()}.${extension}`,
        { type: audioBlob.type || 'audio/webm' }
      );

      const uploadForm = new FormData();
      uploadForm.append('file', recordingFile);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm,
      });
      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadData.filename) {
        throw new Error(uploadData.error || 'Upload failed.');
      }

      setStatusMessage('Transcribing audio...');
      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadData.filename }),
      });
      const transcribeData = await transcribeResponse.json();

      if (!transcribeResponse.ok) {
        throw new Error(transcribeData.error || 'Transcription failed.');
      }

      const transcript = String(transcribeData.transcript || '').trim();
      if (!transcript) {
        throw new Error('No transcription text was returned.');
      }

      setPreviewTranscript(transcript.slice(0, 320));

      const segments = Array.isArray(transcribeData.segments)
        ? (transcribeData.segments as WhisperSegment[]).map((segment) => ({
            speaker: 'Speaker 1',
            timestamp: formatClockDuration(Math.round(segment.start || 0)),
            text: segment.text || '',
          }))
        : [];

      setStatusMessage('Generating summary and saving transcript...');
      const summarizeResponse = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: noteTitle.trim() || 'Untitled recording',
          transcript,
          duration: formatHumanDuration(durationSeconds),
          speakers: [{ name: 'Speaker 1', percentage: 100 }],
          segments,
        }),
      });
      const summarizeData = await summarizeResponse.json();

      if (!summarizeResponse.ok || !summarizeData.id) {
        throw new Error(summarizeData.error || 'Failed to save transcript.');
      }

      setStatusMessage('Saved. Opening transcript...');
      router.push(`/transcripts/${summarizeData.id}`);
    },
    [noteTitle, router]
  );

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
      cleanupMedia().catch(() => undefined);
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
    };
  }, [cleanupMedia, refreshAudioInputs, recordingUrl]);

  const handleStart = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('This browser does not support microphone capture.');
      return;
    }

    setErrorMessage('');
    setPreviewTranscript('');
    setIsPreparing(true);
    setStatusMessage('Requesting microphone access...');

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

        // Video is required by getDisplayMedia in most browsers, but we only need audio.
        displayStream.getVideoTracks().forEach((track) => track.stop());
        loopbackAudioStream = new MediaStream(displayAudioTracks);
      }

      const BrowserAudioContext =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!BrowserAudioContext) {
        throw new Error('AudioContext is not available in this browser.');
      }

      const audioContext = new BrowserAudioContext();
      audioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();

      const micSource = audioContext.createMediaStreamSource(micStream);
      const micGain = audioContext.createGain();
      micGain.gain.value = 1;
      micSource.connect(micGain).connect(destination);

      if (loopbackAudioStream) {
        const loopbackSource = audioContext.createMediaStreamSource(loopbackAudioStream);
        const loopbackGain = audioContext.createGain();
        loopbackGain.gain.value = 1;
        loopbackSource.connect(loopbackGain).connect(destination);
      }

      mixedStreamRef.current = destination.stream;
      const mimeType = getPreferredMimeType();
      const recorder = mimeType
        ? new MediaRecorder(destination.stream, { mimeType })
        : new MediaRecorder(destination.stream);

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const outputType = recorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: outputType });
        const currentDuration = durationRef.current;
        chunksRef.current = [];

        cleanupMedia().catch(() => undefined);

        if (audioBlob.size === 0) {
          setStatusMessage('Recording finished, but no audio was captured.');
          setErrorMessage('No audio data was produced. Check microphone permissions.');
          setIsProcessing(false);
          return;
        }

        setRecordingUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
          }
          return URL.createObjectURL(audioBlob);
        });

        processRecording(audioBlob, currentDuration)
          .catch((error) => {
            setStatusMessage('Recording saved locally, but processing failed.');
            setErrorMessage(normalizeError(error));
          })
          .finally(() => {
            setIsProcessing(false);
          });
      };

      recorder.onerror = () => {
        setErrorMessage('Recording failed unexpectedly.');
        setStatusMessage('Recording error. Please retry.');
      };

      setDuration(0);
      setIsPaused(false);
      setIsRecording(true);
      setStatusMessage(
        includeLoopback
          ? 'Recording microphone + output loopback audio.'
          : 'Recording microphone audio.'
      );
      recorder.start(1000);
    } catch (error) {
      await cleanupMedia();
      setIsRecording(false);
      setIsPaused(false);
      setIsProcessing(false);
      setStatusMessage('Ready to record');
      setErrorMessage(normalizeError(error));
    } finally {
      setIsPreparing(false);
    }
  }, [cleanupMedia, includeLoopback, processRecording, refreshAudioInputs, selectedInputId]);

  const handlePause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    if (recorder.state === 'recording') {
      recorder.pause();
      setIsPaused(true);
      setStatusMessage('Recording paused.');
      return;
    }

    if (recorder.state === 'paused') {
      recorder.resume();
      setIsPaused(false);
      setStatusMessage('Recording resumed.');
    }
  }, []);

  const handleStop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }

    setStatusMessage('Finalizing recording...');
    setIsRecording(false);
    setIsPaused(false);
    setIsProcessing(true);
    recorder.stop();
  }, []);

  const canStart = !isRecording && !isPreparing && !isProcessing;
  const recordingTitle = noteTitle.trim() || 'Untitled recording';

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
      return 'Processing...';
    }
    return 'Start Recording';
  })();

  return (
    <>
      <div className="pr-80 pb-28">
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="max-w-5xl">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Record</h1>
            <div className="text-sm text-gray-600">
              Capture microphone audio and optionally loop back your system/output audio.
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="max-w-5xl space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Title</span>
                  <input
                    value={noteTitle}
                    onChange={(event) => setNoteTitle(event.target.value)}
                    disabled={isRecording || isProcessing}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                    placeholder="Untitled recording"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Audio input source</span>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={selectedInputId}
                      onChange={(event) => setSelectedInputId(event.target.value)}
                      disabled={isRecording || isProcessing || isPreparing || !displayedInputs.length}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
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
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      Refresh
                    </button>
                  </div>
                </label>
              </div>

              <label className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <input
                  type="checkbox"
                  checked={includeLoopback}
                  onChange={(event) => setIncludeLoopback(event.target.checked)}
                  disabled={isRecording || isProcessing || isPreparing}
                  className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    Include output loopback audio
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    On start, the browser will ask you to share a tab/window/screen. Enable
                    audio sharing to capture system output.
                  </div>
                </div>
              </label>

              <div className="text-xs text-gray-500">
                Current input: <span className="font-medium text-gray-700">{selectedDeviceLabel}</span>
              </div>
            </div>

            {!isRecording ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                <div className="text-5xl mb-4">Audio</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{recordingTitle}</h2>
                <p className="text-gray-600 mb-8 max-w-xl mx-auto px-4">
                  {isProcessing
                    ? 'Processing your recording. Please wait.'
                    : 'Choose your input source and start recording when you are ready.'}
                </p>
                <button
                  onClick={handleStart}
                  disabled={!canStart || !displayedInputs.length}
                  className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-blue-300 transition-colors font-medium text-lg inline-flex items-center gap-3"
                >
                  <span className="w-3 h-3 bg-red-500 rounded-full" />
                  {startButtonLabel}
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-8">
                <div className="text-center text-gray-600 mb-6">
                  {includeLoopback
                    ? 'Capturing microphone and loopback output audio.'
                    : 'Capturing microphone audio.'}
                </div>
                <div className="text-center text-4xl font-mono text-gray-900">
                  {formatClockDuration(duration)}
                </div>
              </div>
            )}

            {(statusMessage || errorMessage || previewTranscript || recordingUrl) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="text-sm text-gray-700">
                  <span className="font-semibold">Status:</span> {statusMessage}
                </div>

                {errorMessage && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {errorMessage}
                  </div>
                )}

                {previewTranscript && (
                  <div>
                    <div className="text-sm font-semibold text-gray-800 mb-1">
                      Transcript preview
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{previewTranscript}</p>
                  </div>
                )}

                {recordingUrl && (
                  <audio controls src={recordingUrl} className="w-full">
                    Your browser does not support audio playback.
                  </audio>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isRecording && (
        <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-gray-200 px-8 py-5 z-20">
          <div className="flex items-center gap-6 max-w-5xl mx-auto">
            <button
              onClick={handlePause}
              className="p-4 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <svg className="w-6 h-6 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6 text-gray-700"
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
              onClick={handleStop}
              className="p-4 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
              title="Stop"
            >
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>

            <div className="flex-1 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'
                  }`}
                />
                <span className="text-sm font-medium text-gray-700">
                  {isPaused ? 'Paused' : 'Recording'}
                </span>
              </div>

              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isPaused ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: '100%' }}
                />
              </div>

              <span className="text-sm font-mono text-gray-700 min-w-[4rem]">
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
