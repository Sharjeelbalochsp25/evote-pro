$base = 'http://127.0.0.1:8180/v1/projects/evotepro-7deff/databases/(default)/documents'

$election = @{ fields = @{ title = @{ stringValue = 'Test Election' }; isActive = @{ booleanValue = $true }; verification = @{ mapValue = @{ fields = @{ method = @{ stringValue = 'CNIC' } } } } } }
Write-Host 'Creating election...'
Invoke-RestMethod -Method Post -Uri "$base/users/creator1/elections?documentId=elect1" -Body (ConvertTo-Json $election -Depth 10) -ContentType 'application/json'

$candidate = @{ fields = @{ name = @{ stringValue = 'Alice' }; votes = @{ integerValue = '0' } } }
Write-Host 'Creating candidate...'
Invoke-RestMethod -Method Post -Uri "$base/users/creator1/elections/elect1/candidates?documentId=1" -Body (ConvertTo-Json $candidate -Depth 10) -ContentType 'application/json'

$public = @{ fields = @{ creatorId = @{ stringValue = 'creator1' }; electionId = @{ stringValue = 'elect1' }; isActive = @{ booleanValue = $true } } }
Write-Host 'Creating publicElections entry...'
Invoke-RestMethod -Method Post -Uri "$base/publicElections?documentId=PUBLIC123" -Body (ConvertTo-Json $public -Depth 10) -ContentType 'application/json'

$fnUrl = 'http://127.0.0.1:5101/evotepro-7deff/us-central1/castPublicVoteSecure'
$payload = @{ data = @{ publicCode='PUBLIC123'; candidateId=1; voter=@{ name='Bob'; identifier='12345-1234567-1'; age=30 } } }
Write-Host 'Calling castPublicVoteSecure...'
$fnRes = Invoke-RestMethod -Method Post -Uri $fnUrl -Body (ConvertTo-Json $payload -Depth 10) -ContentType 'application/json'
Write-Host 'Function response:'
$fnRes | ConvertTo-Json -Depth 5

Write-Host 'Fetching candidate...'
$cand = Invoke-RestMethod -Method Get -Uri "$base/users/creator1/elections/elect1/candidates/1"
$cand | ConvertTo-Json -Depth 5
