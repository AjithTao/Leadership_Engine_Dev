$ErrorActionPreference = 'Stop'

$email = $env:ATLASSIAN_EMAIL
$token = $env:ATLASSIAN_API_TOKEN
if (-not $email -or -not $token) {
  throw 'Set ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN environment variables before running this script.'
}
$pair = $email + ':' + $token
$b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{ Authorization = 'Basic ' + $b64; Accept = 'application/json' }

function Get-IssueSummary([string]$key) {
  $url3 = "https://taodigital.atlassian.net/rest/api/3/issue/$key?expand=changelog"
  try {
    $i = Invoke-RestMethod -Uri $url3 -Headers $headers -Method Get
  } catch {
    # Fallback to v2 if v3 returns 404 or errors
    $url2 = "https://taodigital.atlassian.net/rest/api/2/issue/$key?expand=changelog"
    $i = Invoke-RestMethod -Uri $url2 -Headers $headers -Method Get
  }
  [PSCustomObject]@{
    key         = $i.key
    summary     = $i.fields.summary
    status      = $i.fields.status.name
    assignee    = if ($i.fields.assignee) { $i.fields.assignee.displayName } else { $null }
    updated     = $i.fields.updated
    url         = "https://taodigital.atlassian.net/browse/$($i.key)"
    project     = $i.fields.project.key
    projectName = $i.fields.project.name
  }
}

$ccm283 = Get-IssueSummary -key 'CCM-283'
$ccm313 = Get-IssueSummary -key 'CCM-313'
$ccm320 = Get-IssueSummary -key 'CCM-320'
$ces1   = Get-IssueSummary -key 'CES-1'

$users = Invoke-RestMethod -Uri 'https://taodigital.atlassian.net/rest/api/3/user/search?query=Ashwini' -Headers $headers -Method Get
$accountIds = @()
if ($users) {
  foreach ($u in $users) { if ($u.accountId) { $accountIds += $u.accountId } }
}

$stories = @()
if ($accountIds.Count -gt 0) {
  $jql = "type= Story AND assignee in (" + ($accountIds -join ',') + ") AND updated >= -90d ORDER BY updated DESC"
  $encoded = [System.Uri]::EscapeDataString($jql)
  $s = Invoke-RestMethod -Uri ("https://taodigital.atlassian.net/rest/api/3/search?jql=$encoded&maxResults=50&fields=key,summary,status,assignee,updated,project") -Headers $headers -Method Get
  foreach ($issue in $s.issues) {
    $stories += [PSCustomObject]@{
      key      = $issue.key
      summary  = $issue.fields.summary
      status   = $issue.fields.status.name
      assignee = if ($issue.fields.assignee) { $issue.fields.assignee.displayName } else { $null }
      updated  = $issue.fields.updated
      project  = $issue.fields.project.key
      url      = "https://taodigital.atlassian.net/browse/$($issue.key)"
    }
  }
}

$result = [PSCustomObject]@{
  CCM283         = $ccm283
  CCM313         = $ccm313
  CCM320         = $ccm320
  CES1           = $ces1
  AshwiniStories = $stories
}

$result | ConvertTo-Json -Depth 6


