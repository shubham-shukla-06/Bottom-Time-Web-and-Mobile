from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional


class SendOTPRequest(BaseModel):
    identifier: str = Field(max_length=254)

class VerifyOTPRequest(BaseModel):
    identifier: str = Field(max_length=254)
    code: str = Field(min_length=6, max_length=6)

class SignupInitRequest(BaseModel):
    email: str = Field(max_length=254)
    name: str = Field(max_length=200)
    role: str = Field(max_length=20)

class DeviceInfo(BaseModel):
    """Optional payload mobile clients can attach to login / signup requests
    so the server mints a refresh-token-backed device session in the same
    round-trip. Web clients leave this off and the response shape is unchanged.
    """
    device_id: str = Field(min_length=4, max_length=120)
    device_name: str = Field(min_length=1, max_length=120)
    platform: str = Field(pattern="^(ios|android|web)$")
    biometric_enabled: bool = False


class CompleteSignupRequest(BaseModel):
    email: str = Field(max_length=254)
    phone: str = Field(max_length=20)
    email_verified_token: str = Field(max_length=2000)
    phone_verified_token: str = Field(max_length=2000)
    device: Optional[DeviceInfo] = None

class LoginInitRequest(BaseModel):
    email: str = Field(max_length=254)

class CompleteLoginRequest(BaseModel):
    email: str = Field(max_length=254)
    email_verified_token: str = Field(max_length=2000)
    device: Optional[DeviceInfo] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict
    # Mobile-only — populated when the request included `device`. Web clients
    # never see these fields (Pydantic omits None-valued Optionals only if
    # response_model_exclude_none is set; FastAPI defaults already drop them
    # in our setup, but they're explicitly Optional to keep contracts clean).
    refresh_token: Optional[str] = None
    session_id: Optional[str] = None
    refresh_expires_at: Optional[str] = None

class OnboardingRequest(BaseModel):
    experience_level: Optional[str] = None
    certification_level: Optional[str] = None
    interests: List[str] = []
    location_country: Optional[str] = None
    location_city: Optional[str] = None
    date_of_birth: Optional[str] = None
    referral_source: Optional[str] = None
    total_dives: Optional[int] = None
    instructor_certification: Optional[str] = None
    instructor_agency: Optional[str] = None
    instructor_specialties: Optional[List[str]] = None
    instructor_years: Optional[int] = None

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    location_country: Optional[str] = None
    location_city: Optional[str] = None
    date_of_birth: Optional[str] = None
    certification_agency: Optional[str] = None
    last_dive_date: Optional[str] = None
    total_dives: Optional[int] = None
    preferred_dive_types: Optional[List[str]] = None
    medical_fitness: Optional[bool] = None
    equipment_ownership: Optional[str] = None
    languages: Optional[List[str]] = None
    travel_willingness: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    currency: Optional[str] = None
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    year_established: Optional[int] = None
    certifying_agencies: Optional[List[str]] = None
    staff_count: Optional[int] = None
    business_address: Optional[str] = None
    business_phone: Optional[str] = None
    business_email: Optional[str] = None
    website_url: Optional[str] = None
    social_instagram: Optional[str] = None
    social_facebook: Optional[str] = None
    operating_season: Optional[str] = None
    insurance_number: Optional[str] = None

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    phone: str
    name: str
    role: str
    email_verified: bool = True
    phone_verified: bool = True
    status: str = "active"
    experience_level: Optional[str] = None
    certification_level: Optional[str] = None
    interests: List[str] = []
    onboarding_complete: bool = False
    location_country: Optional[str] = None
    location_city: Optional[str] = None
    date_of_birth: Optional[str] = None
    referral_source: Optional[str] = None
    certification_agency: Optional[str] = None
    last_dive_date: Optional[str] = None
    total_dives: Optional[int] = None
    preferred_dive_types: List[str] = []
    medical_fitness: Optional[bool] = None
    equipment_ownership: Optional[str] = None
    languages: List[str] = []
    travel_willingness: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    instructor_certification: Optional[str] = None
    instructor_agency: Optional[str] = None
    instructor_specialties: List[str] = []
    instructor_years: Optional[int] = None
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    year_established: Optional[int] = None
    certifying_agencies: List[str] = []
    staff_count: Optional[int] = None
    business_address: Optional[str] = None
    business_phone: Optional[str] = None
    business_email: Optional[str] = None
    website_url: Optional[str] = None
    social_instagram: Optional[str] = None
    social_facebook: Optional[str] = None
    operating_season: Optional[str] = None
    insurance_number: Optional[str] = None
    currency: str = "USD"
    profile_photo: Optional[str] = None
    created_at: str

class ListingCreate(BaseModel):
    name: str
    type: str
    description: str
    location: str
    country: str
    price: Optional[float] = None
    currency: str = "USD"
    difficulty: Optional[str] = None
    duration: Optional[str] = None
    image_url: str
    rating: Optional[float] = 4.5
    review_count: Optional[int] = 0
    highlights: List[str] = []
    gst_acknowledged: Optional[bool] = None

class Listing(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    operator_id: Optional[str] = None
    name: str
    type: str
    description: str
    location: str
    country: str
    price: Optional[float] = None
    currency: str = "USD"
    difficulty: Optional[str] = None
    duration: Optional[str] = None
    image_url: str
    rating: float = 4.5
    review_count: int = 0
    highlights: List[str] = []
    status: str = "active"
    created_at: str
    updated_at: str

class AvailabilityUpdate(BaseModel):
    available_dates: List[str]

class BookingRequest(BaseModel):
    listing_id: str
    date: str
    participants: int = 1
    notes: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None

class TrackEventRequest(BaseModel):
    event_type: str
    data: dict = {}

class AdminAddRequest(BaseModel):
    email: str
    phone: Optional[str] = None

class UTMCaptureRequest(BaseModel):
    visitor_id: str
    user_id: Optional[str] = None
    utm_source: Optional[str] = ""
    utm_medium: Optional[str] = ""
    utm_campaign: Optional[str] = ""
    utm_content: Optional[str] = ""
    utm_term: Optional[str] = ""
    landing_page: Optional[str] = ""
    referrer: Optional[str] = ""
    operator_id: Optional[str] = ""

class CampaignCreateRequest(BaseModel):
    campaign_name: str
    source: str
    medium: str
    content: Optional[str] = ""
    term: Optional[str] = ""
    destination: str = "/"
    operator_id: Optional[str] = ""
    spend: Optional[float] = 0
    notes: Optional[str] = ""

class ReviewCreate(BaseModel):
    listing_id: str = Field(max_length=50)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(max_length=2000)

class MessageSend(BaseModel):
    to_id: Optional[str] = Field(default=None, max_length=50)
    thread_id: Optional[str] = Field(default=None, max_length=50)
    content: str = Field(max_length=5000)
    booking_id: Optional[str] = Field(default=None, max_length=50)

class GroupThreadCreate(BaseModel):
    participant_ids: List[str]
    name: Optional[str] = None

class TripCreate(BaseModel):
    name: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None

class TripItemAdd(BaseModel):
    listing_id: str
    note: Optional[str] = None
    day: Optional[int] = None

class DiveLogEntry(BaseModel):
    site_name: str
    location: str
    date: str
    dive_type: Optional[str] = None
    max_depth: Optional[float] = None
    avg_depth: Optional[float] = None
    duration: Optional[int] = None
    buddy: Optional[str] = None
    visibility: Optional[str] = None
    water_temp: Optional[float] = None
    air_temp: Optional[float] = None
    notes: Optional[str] = None
    rating: Optional[int] = None
    photos: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    # GPS
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    # Gas & Tank
    gas_mix: Optional[str] = None
    tank_size: Optional[float] = None
    tank_start_pressure: Optional[int] = None
    tank_end_pressure: Optional[int] = None
    sac_rate: Optional[float] = None
    # Multi-tank
    tanks: Optional[list] = None
    # Gas switches [{time_seconds, depth, gas_mix}]
    gas_switches: Optional[list] = None
    # Computed fields
    cns_percent: Optional[float] = None
    otu: Optional[float] = None
    # Equipment
    weight: Optional[float] = None
    suit_type: Optional[str] = None
    # Dive computer
    computer_model: Optional[str] = None
    computer_serial: Optional[str] = None
    # Profile data
    profile: Optional[list] = None
    source: Optional[str] = None
    source_file: Optional[str] = None
    # Trip grouping
    trip_id: Optional[str] = None
    trip_name: Optional[str] = None
    # Conditions
    current: Optional[str] = None
    surface_conditions: Optional[str] = None
    entry_type: Optional[str] = None
    water_type: Optional[str] = None

class ReportCreateRequest(BaseModel):
    reported_id: str = Field(max_length=50)
    reason: str = Field(max_length=200)
    details: Optional[str] = Field(default=None, max_length=2000)
    context_type: Optional[str] = Field(default=None, max_length=50)
    context_id: Optional[str] = Field(default=None, max_length=50)


class SocialGoogleRequest(BaseModel):
    session_id: str


class SocialMicrosoftRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


class SocialGoogleCodeRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


class SocialMicrosoftTokenRequest(BaseModel):
    id_token: str


class SocialSignupCompleteRequest(BaseModel):
    email: str
    name: str
    role: str
    provider: str
    phone: str
    phone_verified_token: str
    device: Optional[DeviceInfo] = None


class OperatorPayoutSettings(BaseModel):
    payout_country: str
    payout_currency: str
    bank_account_name: str
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    swift_code: Optional[str] = None
    iban: Optional[str] = None
    routing_number: Optional[str] = None
    sort_code: Optional[str] = None


class PlatformFeeUpdate(BaseModel):
    entity_type: str
    entity_id: str
    platform_fee_percent: float
