$ErrorActionPreference = "Stop"

function Invoke-Status {
  param(
    [string]$Uri,
    [hashtable]$Headers,
    [string]$Body
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Uri -Headers $Headers -Body $Body
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}

$status = npx supabase status -o json | ConvertFrom-Json
$suffix = [guid]::NewGuid().ToString("N")
$email = "edge-check-$suffix@example.com"
$password = "EdgeCheck!23456789"
$signupHeaders = @{ apikey = $status.ANON_KEY; "Content-Type" = "application/json" }
$signupBody = @{ email = $email; password = $password } | ConvertTo-Json
$signup = Invoke-RestMethod -Method Post -Uri "$($status.API_URL)/auth/v1/signup" -Headers $signupHeaders -Body $signupBody
$uid = $signup.user.id
$jwt = $signup.access_token

if (-not $uid -or -not $jwt) {
  throw "signup did not return user and access token"
}

$spaceName = "Edge deleted-space $suffix"
$postTitle = "Edge post $suffix"
$attachmentPath = "edge-check/$suffix"
$sql = @"
update public.profiles set type='teacher',status='accepted' where auth_user_id='$uid';
select set_config('request.jwt.claim.sub','$uid',false);
select public.create_space('community','$spaceName',null,'invite_only');
insert into public.posts(space_id,author_id,title,content)
select s.id,p.id,'$postTitle','body'
from public.spaces s
join public.profiles p on p.auth_user_id='$uid'
where s.name='$spaceName';
insert into public.post_attachments(post_id,storage_bucket,storage_path,file_name,content_type,size_bytes,sort_order)
select po.id,'post-files','$attachmentPath','fake.pdf','application/pdf',1,0
from public.posts po
where po.title='$postTitle';
select s.id::text||','||po.id::text
from public.spaces s
join public.posts po on po.space_id=s.id
where s.name='$spaceName' and po.title='$postTitle';
"@

$ids = $sql | docker exec -i supabase_db_NEW-KMLA-ONLINE psql -U postgres -d postgres -At -v ON_ERROR_STOP=1
$pair = ($ids | Select-Object -Last 1).Split(",")
$spaceId = [int64]$pair[0]
$postId = [int64]$pair[1]
$userHeaders = @{ Authorization = "Bearer $jwt"; apikey = $status.ANON_KEY; "Content-Type" = "application/json" }
$invalidUpload = Invoke-Status "$($status.FUNCTIONS_URL)/authorize-upload" $userHeaders "{"
$invalidDownload = Invoke-Status "$($status.FUNCTIONS_URL)/authorize-download" $userHeaders "{"
if ($invalidUpload -ne 400 -or $invalidDownload -ne 400) {
  throw "malformed JSON was not rejected: upload=$invalidUpload, download=$invalidDownload"
}

$uploadBody = @{
  kind = "post-file"
  parentId = $postId
  contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  sizeBytes = 1024
} | ConvertTo-Json

$activeUpload = Invoke-Status "$($status.FUNCTIONS_URL)/authorize-upload" $userHeaders $uploadBody
if ($activeUpload -ne 200) {
  throw "active-space upload authorization failed: $activeUpload"
}

"update public.spaces set deleted_at=now() where id=$spaceId;" |
  docker exec -i supabase_db_NEW-KMLA-ONLINE psql -U postgres -d postgres -v ON_ERROR_STOP=1 |
  Out-Null

$deletedUpload = Invoke-Status "$($status.FUNCTIONS_URL)/authorize-upload" $userHeaders $uploadBody
$downloadBody = @{ bucket = "post-files"; path = $attachmentPath } | ConvertTo-Json
$deletedDownload = Invoke-Status "$($status.FUNCTIONS_URL)/authorize-download" $userHeaders $downloadBody

if ($deletedUpload -ne 403 -or $deletedDownload -ne 403) {
  throw "deleted-space access was not blocked: upload=$deletedUpload, download=$deletedDownload"
}

$secretHeaders = @{ apikey = $status.SECRET_KEY; "Content-Type" = "application/json" }
$maintenance = Invoke-RestMethod -Method Post -Uri "$($status.FUNCTIONS_URL)/storage-maintenance" -Headers $secretHeaders -Body "{}"

Write-Output "active upload=$activeUpload; deleted-space upload=$deletedUpload; deleted-space download=$deletedDownload"
Write-Output "malformed JSON upload=$invalidUpload; malformed JSON download=$invalidDownload"
Write-Output "storage maintenance=$($maintenance | ConvertTo-Json -Compress)"
