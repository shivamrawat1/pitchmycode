// interview_behavioral/static/js/mainb.js

// Immediately log that the script is running
console.log("main.js is running");

// Initialize Webcam and Audio
const video = document.getElementById('videoElement');
const timerDisplay = document.getElementById('timer-display');
const currentTimeDisplay = document.getElementById('current-time');
const sendButton = document.getElementById('send-button');
const userInput = document.getElementById('user-input');
const chatMessages = document.getElementById('chat-messages');
const leaveButton = document.getElementById('leave-button');
const muteButton = document.getElementById('mute-button');
let conversation = [];

// Update current time
function updateCurrentTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;

    currentTimeDisplay.textContent = `${formattedHours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${ampm}`;
}

// Update time every second
setInterval(updateCurrentTime, 1000);
updateCurrentTime(); // Initial update

// Voice Recording Variables
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isMuted = false;
let silenceTimer = null;
let audioContext = null;
let audioAnalyser = null;
let isUserSpeaking = false;
let isBotSpeaking = false;
let audioElement = null;
let endpointingTimeout = 500; // 500ms of silence to consider speech ended

// Initialize video and audio stream
let videoStream;
navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
        videoStream = stream;
        video.srcObject = stream;

        // Set up audio context for speech detection
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 256;
        source.connect(audioAnalyser);

        // Initialize media recorder for voice input
        mediaRecorder = new MediaRecorder(stream);
        setupMediaRecorder();

        // Start monitoring audio levels for speech detection
        startSpeechDetection();
    })
    .catch((error) => {
        console.error("Error accessing webcam:", error);
    });

// Function to detect speech based on audio levels
function startSpeechDetection() {
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function checkAudioLevel() {
        if (isMuted) {
            requestAnimationFrame(checkAudioLevel);
            return;
        }

        audioAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Threshold for speech detection
        const threshold = 15;

        if (average > threshold) {
            // User is speaking
            if (!isUserSpeaking) {
                userStartedSpeaking();
            }

            // Reset silence timer
            if (silenceTimer) {
                clearTimeout(silenceTimer);
            }

            // Set a new silence timer
            silenceTimer = setTimeout(() => {
                userStoppedSpeaking();
            }, endpointingTimeout);
        }

        requestAnimationFrame(checkAudioLevel);
    }

    checkAudioLevel();
}

// Function when user starts speaking
function userStartedSpeaking() {
    console.log('User started speaking');
    isUserSpeaking = true;

    // If bot is speaking, stop it (barge-in functionality)
    if (isBotSpeaking && audioElement) {
        console.log('Interrupting bot speech (barge-in)');
        audioElement.pause();
        audioElement.currentTime = 0;
        isBotSpeaking = false;
    }

    // Start recording if not already recording
    if (!isRecording) {
        startRecording();
    }
}

// Function when user stops speaking
function userStoppedSpeaking() {
    console.log('User stopped speaking');
    isUserSpeaking = false;

    // Stop recording and process the audio
    if (isRecording) {
        stopRecording();
    }
}

// Function to start recording
function startRecording() {
    if (mediaRecorder && mediaRecorder.state === 'inactive' && !isMuted) {
        audioChunks = [];
        mediaRecorder.start();
        isRecording = true;
        console.log('Recording started');
    }
}

// Function to stop recording
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isRecording = false;
        console.log('Recording stopped');
    }
}

// Setup MediaRecorder event handlers
function setupMediaRecorder() {
    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        if (audioChunks.length === 0) return;

        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        audioChunks = [];

        // Create form data and send to backend
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');

        try {
            const response = await fetch('/interview_behavioral/process_audio/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrftoken,
                },
                body: formData
            });
            const data = await response.json();

            if (data.recognized_text) {
                appendMessage('You', data.recognized_text);
                // Get AI response
                const aiResponse = await fetch('/interview_behavioral/get_response/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrftoken,
                    },
                    body: JSON.stringify({ message: data.recognized_text })
                });
                const aiData = await aiResponse.json();
                if (aiData.message) {
                    appendMessage('Assistant', aiData.message);
                    botStartedSpeaking();
                    await synthesizeSpeech(aiData.message);
                    botStoppedSpeaking();
                }
            }
        } catch (error) {
            console.error('Error processing audio:', error);
        }
    };
}

// Function when bot starts speaking
function botStartedSpeaking() {
    console.log('Bot started speaking');
    isBotSpeaking = true;
}

// Function when bot stops speaking
function botStoppedSpeaking() {
    console.log('Bot stopped speaking');
    isBotSpeaking = false;
}

// Timer Functionality
let startTime = Date.now();
let timerInterval;
const duration = parseInt(document.getElementById('interview-duration').value) || 30;
let timeRemaining = duration * 60; // Convert to seconds

function updateTimer() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    if (timeRemaining <= 0) {
        clearInterval(timerInterval);
        alert('Interview time is up!');
        saveAssessment();
    } else {
        timeRemaining--;
    }
}

// Start the timer immediately
timerInterval = setInterval(updateTimer, 1000);

// Helper: Get CSRF Token
function getCookie(name) {
    if (name === 'csrftoken') {
        // First try to get from meta tag
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            const token = metaTag.getAttribute('content');
            console.log('CSRF token found in meta tag');
            return token;
        }
        console.log('CSRF token not found in meta tag, trying cookies');
    }

    // Try cookies as fallback
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith(name + '=')) {
            const token = decodeURIComponent(trimmed.substring(name.length + 1));
            console.log('CSRF token found in cookies');
            return token;
        }
    }

    console.error('CSRF token not found in meta tag or cookies');
    return null;
}

// Initialize CSRF token with more detailed logging
const csrftoken = getCookie('csrftoken');
if (!csrftoken) {
    console.error('CSRF token initialization failed. Form submissions will fail.');
    console.error('Meta tag status:', document.querySelector('meta[name="csrf-token"]') ? 'present' : 'missing');
    console.error('Cookie status:', document.cookie.includes('csrftoken') ? 'present' : 'missing');
} else {
    console.log('CSRF token successfully initialized');
}

// Append a Message to the Chat
function appendMessage(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    conversation.push({ sender, message });
}

// Synthesize Speech
async function synthesizeSpeech(text) {
    try {
        const response = await fetch('/interview_behavioral/synthesize_text/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRFToken': csrftoken,
            },
            body: new URLSearchParams({ text }),
        });

        const blob = await response.blob();

        // Create and play audio
        if (audioElement) {
            // If there's an existing audio element, clean it up
            audioElement.pause();
            audioElement.remove();
        }

        audioElement = new Audio(URL.createObjectURL(blob));

        // Add event listener for when audio ends
        audioElement.addEventListener('ended', () => {
            botStoppedSpeaking();
        });

        // Play the audio
        await audioElement.play();

        return new Promise((resolve) => {
            audioElement.onended = resolve;
        });
    } catch (error) {
        console.error('Speech synthesis error:', error);
        botStoppedSpeaking();
    }
}

// Send a Text Message
async function sendMessage() {
    const message = userInput.value.trim();
    if (message === '') return;

    appendMessage('You', message);
    userInput.value = '';
    userInput.style.height = 'auto';

    try {
        const response = await fetch('/interview_behavioral/get_response/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify({ message }),
        });
        const data = await response.json();

        if (data.message) {
            appendMessage('Assistant', data.message);
            botStartedSpeaking();
            await synthesizeSpeech(data.message);
            botStoppedSpeaking();
        } else if (data.error) {
            appendMessage('Error', data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        appendMessage('Error', 'Failed to get response from the assistant.');
    }
}

// Event Listeners
sendButton.addEventListener('click', sendMessage);

// Handle text input
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize text area
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Handle Mute Button Click
muteButton.addEventListener('click', () => {
    isMuted = !isMuted;

    // Toggle video mute
    video.muted = isMuted;

    // Handle audio recording
    if (isMuted) {
        if (isRecording) {
            stopRecording();
        }
    }

    // Toggle audio tracks
    if (videoStream) {
        videoStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
    }

    // Update button appearance
    muteButton.classList.toggle('active', isMuted);
});

// Function to Save Assessment
function saveAssessment() {
    if (conversation.length === 0) {
        alert('No conversation to save.');
        return;
    }

    fetch('/assessments/save/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrftoken,
        },
        body: JSON.stringify({
            conversation: conversation,
            assessment_type: 'behavioral'
        }),
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.message) {
                alert(data.message);
                window.location.href = '/assessments/list/';
            } else if (data.error) {
                alert(`Error: ${data.error}`);
            }
        })
        .catch((error) => console.error('Save Assessment Error:', error));
}

// Handle Leave Button Click
leaveButton.addEventListener('click', () => {
    clearInterval(timerInterval);

    // Stop recording if active
    if (isRecording) {
        mediaRecorder.stop();
        isRecording = false;
    }

    // Stop all tracks
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }

    saveAssessment();
});

// Immediately execute when script loads
(function () {
    console.log("Immediate execution started");

    // Get the elements
    const timerDisplay = document.getElementById('timer-display');
    const durationInput = document.getElementById('interview-duration');

    // Verify elements exist
    if (!timerDisplay || !durationInput) {
        console.error("Timer elements not found");
        return;
    }

    // Get duration value
    const duration = parseInt(durationInput.value) || 30;
    let seconds = duration * 60;

    // Update timer display
    function updateTimer() {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        timerDisplay.textContent = `Time Remaining: ${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

        if (seconds === 0) {
            clearInterval(countdownInterval);
            timerDisplay.style.backgroundColor = 'rgba(255,0,0,0.7)';
            alert('Time is up!');
            if (typeof saveAssessment === 'function') {
                saveAssessment();
            }
        } else {
            seconds--;
        }
    }

    // Initial display
    updateTimer();

    // Start countdown
    const countdownInterval = setInterval(updateTimer, 1000);

    console.log("Timer initialized with duration:", duration, "minutes");
})();
