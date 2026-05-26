param(
    [Parameter(Mandatory=$true)][string]$ElectionId,
    [Parameter(Mandatory=$false)][string]$OutFile = "backup-$((Get-Date).ToString('yyyyMMdd-HHmmss'))-$ElectionId.json",
    [Parameter(Mandatory=$false)][string]$Email = "creator@example.com",
    [Parameter(Mandatory=$false)][string]$Password = "password"
)

$authSignUp = 'http://127.0.0.1:9100/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any'
$authSignIn = 'http://127.0.0.1:9100/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=any'
$apiBase = 'http://127.0.0.1:5101/evotepro-7deff/us-central1/api'

Write-Host "Signing in to Auth emulator as $Email..."
$body = @{ email = $Email; password = $Password; returnSecureToken = $true }
try {
    $signin = Invoke-RestMethod -Method Post -Uri $authSignIn -Body (ConvertTo-Json $body) -ContentType 'application/json' -ErrorAction Stop
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

$exportUrl = "$apiBase/api/elections/$ElectionId/export"
Write-Host "Fetching export from $exportUrl"
$headers = @{ Authorization = "Bearer $idToken" }
try {
    $resp = Invoke-RestMethod -Method Get -Uri $exportUrl -Headers $headers -ErrorAction Stop
    $json = $resp | ConvertTo-Json -Depth 10
    $json | Out-File -FilePath $OutFile -Encoding UTF8
    Write-Host "Export saved to $OutFile"
} catch {
    Write-Host "Failed to fetch export:`n$($_.Exception.Response.Content.ReadAsStringAsync().Result)"
}
