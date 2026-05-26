$authSignUp = 'http://127.0.0.1:9100/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any'
$authSignIn = 'http://127.0.0.1:9100/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=any'
$apiBase = 'http://127.0.0.1:5101/evotepro-7deff/us-central1/api'
$fsBase = 'http://127.0.0.1:8180/v1/projects/evotepro-7deff/databases/(default)/documents'

# 1) Sign up user
$body = @{ email = 'creator@example.com'; password = 'password'; returnSecureToken = $true }
Write-Host 'Authenticating test user (sign-in, fallback to sign-up)...'
try {
	$signin = Invoke-RestMethod -Method Post -Uri $authSignIn -Body (ConvertTo-Json @{ email = $body.email; password = $body.password; returnSecureToken = $true }) -ContentType 'application/json' -ErrorAction Stop
	$idToken = $signin.idToken
	$localId = $signin.localId
	Write-Host "Signed in user uid=$localId"
} catch {
	Write-Host 'Sign-in failed; attempting sign-up...'
	$signup = Invoke-RestMethod -Method Post -Uri $authSignUp -Body (ConvertTo-Json $body) -ContentType 'application/json' -ErrorAction Stop
	$idToken = $signup.idToken
	$localId = $signup.localId
	Write-Host "Signed up user uid=$localId"
}

# 2) Register user via API (creates user profile in Firestore via admin)
Write-Host 'Registering user profile via API...'
$headers = @{ Authorization = "Bearer $idToken" }
$reg = Invoke-RestMethod -Method Post -Uri "$apiBase/api/auth/register" -Headers $headers -Body (ConvertTo-Json @{ name = 'Creator Tester' }) -ContentType 'application/json' -ErrorAction Stop
Write-Host "Registered profile id=$($reg.id)"

# 3) Create election via API
Write-Host 'Creating election via API...'
$createElectionBody = @{ title = 'SmokeTest Election'; description = 'Created by smoke test' }
$election = Invoke-RestMethod -Method Post -Uri "$apiBase/api/elections" -Headers $headers -Body (ConvertTo-Json $createElectionBody) -ContentType 'application/json' -ErrorAction Stop
$newElectionId = $election.id
$newPublicLink = $election.publicLink
Write-Host "Created election id=$newElectionId publicLink=$newPublicLink"

# 4) Add candidate via API
Write-Host 'Adding candidate via API...'
$candBody = @{ name = 'Alice' }
$cand = Invoke-RestMethod -Method Post -Uri "$apiBase/api/elections/$newElectionId/candidates" -Headers $headers -Body (ConvertTo-Json $candBody) -ContentType 'application/json' -ErrorAction Stop
$candId = $cand.id
Write-Host "Added candidate id=$candId"

# 5) Create publicElections mirror (must be authenticated as creator)
Write-Host 'Creating publicElections mirror (authenticated)...'
$publicBody = @{ fields = @{ creatorId = @{ stringValue = $localId }; electionId = @{ stringValue = $newElectionId }; isActive = @{ booleanValue = $true } } }
Invoke-RestMethod -Method Post -Uri "$fsBase/publicElections?documentId=$($newPublicLink)" -Headers $headers -Body (ConvertTo-Json $publicBody -Depth 10) -ContentType 'application/json' -ErrorAction Stop
Write-Host "Created publicElections/$newPublicLink"

# 6) Call castPublicVoteSecure
Write-Host 'Calling castPublicVoteSecure...'
$fnUrl = "http://127.0.0.1:5101/evotepro-7deff/us-central1/castPublicVoteSecure"
$payload = @{ data = @{ publicCode = $newPublicLink; candidateId = $candId; voter = @{ name = 'Bob'; identifier = '12345-1234567-1'; age = 30 } } }
$fnRes = Invoke-RestMethod -Method Post -Uri $fnUrl -Body (ConvertTo-Json $payload -Depth 10) -ContentType 'application/json' -ErrorAction Stop
Write-Host 'Function response:'
$fnRes | ConvertTo-Json -Depth 5

# 7) Fetch candidate doc to verify votes
Write-Host 'Fetching candidate document...'
$candDoc = Invoke-RestMethod -Method Get -Uri "$fsBase/users/$localId/elections/$newElectionId/candidates/$candId" -Headers $headers
$candDoc | ConvertTo-Json -Depth 5

Write-Host 'Smoke test completed.'
