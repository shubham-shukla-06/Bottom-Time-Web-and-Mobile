import os
from pathlib import Path
from dotenv import load_dotenv
from twilio.rest import Client
import razorpay

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

JWT_SECRET = os.environ['JWT_SECRET_KEY']
ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', 10080))

twilio_sid = os.environ.get('TWILIO_ACCOUNT_SID', '')
twilio_token = os.environ.get('TWILIO_AUTH_TOKEN', '')
twilio_verify_sid = os.environ.get('TWILIO_VERIFY_SERVICE_SID', '')
twilio_client = None
if twilio_sid and twilio_token:
    twilio_client = Client(twilio_sid, twilio_token)

razorpay_key_id = os.environ.get('RAZORPAY_KEY_ID', '')
razorpay_key_secret = os.environ.get('RAZORPAY_KEY_SECRET', '')
razorpay_webhook_secret = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')
razorpay_client = None
if razorpay_key_id and razorpay_key_secret and 'placeholder' not in razorpay_key_id:
    razorpay_client = razorpay.Client(auth=(razorpay_key_id, razorpay_key_secret))

wise_api_token = os.environ.get('WISE_API_TOKEN', '')
wise_api_base_url = os.environ.get('WISE_API_BASE_URL', 'https://api.sandbox.transferwise.tech')
wise_profile_id = os.environ.get('WISE_PROFILE_ID', '0')

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

SUPER_ADMINS = [
    {"email": "shubham@bottom-time.com", "phone": "+919324834019"},
]

SUPPORTED_CURRENCIES = "EUR,GBP,INR,AUD,CAD,JPY,THB,IDR,MYR,PHP,SGD,NZD,BRL,MXN"

REPORT_REASONS = ["Misleading info", "Unsafe practices", "Inappropriate behavior", "Spam", "Fake profile", "Other"]

VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'mailto:noreply@bottom-time.com')

MS_TENANT_ID = os.environ.get('MS_TENANT_ID', '')
MS_CLIENT_ID = os.environ.get('MS_CLIENT_ID', '')
MS_CLIENT_SECRET = os.environ.get('MS_CLIENT_SECRET', '')
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
GOOGLE_OAUTH_CLIENT_SECRET = os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', '')
