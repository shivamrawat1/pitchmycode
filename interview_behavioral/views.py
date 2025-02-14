# interview_behavioral/views.py

import json
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
from django.contrib.auth.decorators import login_required

from interview_behavioral.openai_client import OpenAIClient
from interview_behavioral.services.deepgram_service import DeepgramService
from interview_behavioral.services.speech_recognition_handler import SpeechRecognitionService
from interview_behavioral.services.controller import SpeechController
from interview_behavioral.services.gtts_service import GTTSService

# Initialize services
openai_client = OpenAIClient()
deepgram_service = DeepgramService()
recognition_service = SpeechRecognitionService(deepgram_service)
gtts_service = GTTSService()
controller = SpeechController(recognition_service, gtts_service)

@login_required
def setup(request):
    return render(request, 'interview_behavioral/setup.html')

@login_required
@ensure_csrf_cookie
def index(request):
    if request.method == 'POST':
        resume = request.POST.get('resume')
        job_description = request.POST.get('job_description')
        duration = int(request.POST.get('duration', 30))  # Default to 30 if not set
        
        # Store in session
        request.session['resume'] = resume
        request.session['job_description'] = job_description
        request.session['interview_duration'] = duration
        
        # Initialize OpenAI client with setup information
        openai_client.initialize_interview(resume, job_description)
    
    # Always pass duration to template, either from POST or session
    context = {
        'duration': request.session.get('interview_duration', 30)
    }
    print(f"Behavioral Interview Duration: {context['duration']}")  # Debug print
    return render(request, 'interview_behavioral/index.html', context)

@csrf_exempt
def get_response(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            user_message = data.get('message')
            if not user_message:
                return JsonResponse({'error': 'Message is required.'}, status=400)
            
            assistant_message = openai_client.get_response(user_message)
            return JsonResponse({'message': assistant_message})
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON.'}, status=400)
    return JsonResponse({'error': 'Invalid request method.'}, status=400)

@method_decorator(csrf_exempt, name='dispatch')
class ProcessAudioView(View):
    async def post(self, request):
        try:
            audio_file = request.FILES.get('audio')
            if not audio_file:
                return JsonResponse({'error': 'No audio file provided'}, status=400)
            
            audio_buffer = audio_file.read()
            recognized_text = await controller.handle_voice_command(audio_buffer)
            return JsonResponse({'recognized_text': recognized_text})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class SynthesizeTextView(View):
    def post(self, request):
        text = request.POST.get('text', '')
        if not text:
            return JsonResponse({'error': 'No text provided'}, status=400)
        
        try:
            audio_content = controller.synthesize_text(text)
            response = HttpResponse(audio_content, content_type='audio/mp3')
            response['Content-Disposition'] = 'attachment; filename="output.mp3"'
            return response
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
