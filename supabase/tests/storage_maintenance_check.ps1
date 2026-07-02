$ErrorActionPreference = "Stop"

$status = npx supabase status -o json | ConvertFrom-Json
$suffix = [guid]::NewGuid().ToString("N")
$path = "maintenance-check/$suffix"

$insertSql = @"
insert into private.attachment_cleanup_queue(storage_bucket,storage_path)
values ('avatars','$path')
returning id;
"@

$queueId = ($insertSql | docker exec -i supabase_db_NEW-KMLA-ONLINE psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 | Select-Object -Last 1)
if (-not $queueId) {
  throw "storage cleanup queue insert failed"
}

$secretHeaders = @{ apikey = $status.SECRET_KEY; "Content-Type" = "application/json" }
$maintenance = Invoke-RestMethod -Method Post -Uri "$($status.FUNCTIONS_URL)/storage-maintenance" -Headers $secretHeaders -Body "{}"

$checkSql = "select processed_at is not null from private.attachment_cleanup_queue where id=$queueId;"
$processed = ($checkSql | docker exec -i supabase_db_NEW-KMLA-ONLINE psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 | Select-Object -Last 1)
if ($processed -ne "t") {
  throw "storage maintenance did not complete queued cleanup id=$queueId"
}

Write-Output "storage maintenance=$($maintenance | ConvertTo-Json -Compress)"
Write-Output "cleanup queue id=$queueId processed"
