# Configuration
# -----------------------------------------------------------------------------
# Add your ticket IDs here
$TicketIds = @(
    "2966C1",
    "299JUG",
    "29AFC7",
    "41UHTK",
    "290W0B",
    "295MDK",
    "2998U9",
    "41UDUO",
    "295PPP",
    "295PQ6",
    "2998UG",
    "41XBES",
    "295PU9",
    "28OKQ0",
    "2921J8",
    "41X6FO"
)

# Token - Replace with your actual token
$Token = "CortexvFwXqfV5gFDzUOfYF1YYyzlMi5a.pPmFjRADp9yEXlBjUcZL7SPz2Q85DewmtLQs" 

# Path to the CSV file
$CsvFilePath = "$PSScriptRoot\Time_tracking_data.csv"

# OrangeLogic API URL
$ApiUrl = "https://link.orangelogic.com/API/Search/v4.0/Search"
# -----------------------------------------------------------------------------

# Supported Types to filter
$AllowedTypes = @("Development", "Configuration Request", "Defect - QA Vietnam", "Question")

# Get Current Date
$CaptureDate = Get-Date -Format "yyyy-MM-dd"

Write-Host "Script started. Using API URL: $ApiUrl" -ForegroundColor Gray

# Helper Function: Search-OLTask
function Search-OLTask {
    param (
        [string]$Query,
        [string]$Token,
        [string]$ApiUrl = "https://link.orangelogic.com/API/Search/v4.0/Search"
    )
    
    if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
        Write-Warning "ApiUrl is empty inside function! Using default."
        $ApiUrl = "https://link.orangelogic.com/API/Search/v4.0/Search"
    }

    $Fields = @(
        "CoreField.Title", 
        "CoreField.Identifier", 
        "SystemIdentifier", 
        "CoreField.DocSubType", 
        "CoreField.Status",
        "AssignedTo", 
        "Document.TimeSpentMn", 
        "Document.TimeLeftMn"
    ) -join ","

    # Use a Hashtable for params and let PowerShell handle the encoding/concatenation
    $Params = @{
        query  = $Query
        token  = $Token
        fields = $Fields
        format = "JSON"
        limit  = 1000
    }

    # Construct Query String manually to be safe with OL API
    $EncodedParams = $Params.Keys | ForEach-Object {
        "{0}={1}" -f $_, [Uri]::EscapeDataString($Params[$_])
    }
    $QueryString = $EncodedParams -join "&"
    $FullUrl = "$ApiUrl`?$QueryString"

    # Write-Host "DEBUG: FullUrl: $FullUrl" -ForegroundColor DarkGray

    try {
        $Response = Invoke-RestMethod -Uri $FullUrl -Method Get
        if ($Response.success -eq $false) {
            Write-Error "API Error: $($Response.error)"
            return $null
        }
        return $Response.APIResponse.Items
    }
    catch {
        Write-Error "Request Failed: $_"
        Write-Host "URL called: $FullUrl" -ForegroundColor Red
        return $null
    }
}

# Ensure CSV exists and has headers
if (-not (Test-Path $CsvFilePath)) {
    "Capture date,Enhancement title,Task title,Type,Assignee,Time spent,Time left" | Set-Content $CsvFilePath -Encoding UTF8
}

# Read existing data
$TrackingData = @()
if (Test-Path $CsvFilePath) {
    $TrackingData = @(Import-Csv $CsvFilePath)
}

# Create a lookup for fast updates (Index based)
$DataIndex = @{}
for ($i = 0; $i -lt $TrackingData.Count; $i++) {
    $row = $TrackingData[$i]
    $key = "$($row.'Capture date')|$($row.'Enhancement title')|$($row.'Task title')"
    $DataIndex[$key] = $i
}

foreach ($TicketId in $TicketIds) {
    # Ensure ID has 'L-' prefix
    $FullTicketId = if ($TicketId -match "^L-") { $TicketId } else { "L-$TicketId" }
    Write-Host "Processing Ticket: $FullTicketId" -ForegroundColor Cyan

    # 1. Get Enhancement Details (Title)
    # Using exact match syntax with parentheses
    $EnhancementTask = Search-OLTask -Query "SystemIdentifier:(`"$FullTicketId`")" -Token $Token -ApiUrl $ApiUrl
    
    if (-not $EnhancementTask -or $EnhancementTask.Count -eq 0) {
        Write-Warning "Enhancement ticket not found: $FullTicketId"
        continue
    }

    $EnhancementTitle = $EnhancementTask[0]."CoreField.Title"
    
    if ([string]::IsNullOrWhiteSpace($EnhancementTitle)) {
        Write-Warning "Enhancement Title is empty for: $FullTicketId."
        continue
    }

    Write-Host "  Enhancement: $EnhancementTitle" -ForegroundColor Green

    # 2. Get All Direct Children (using lowercase 'f' as per API quirk)
    $DirectChildren = Search-OLTask -Query "Parentfolderidentifier:(`"$FullTicketId`")" -Token $Token -ApiUrl $ApiUrl
    Write-Host "    Direct Children Count: $(if ($DirectChildren) { $DirectChildren.Count } else { 0 })" -ForegroundColor Gray

    # 3. Identify 'Development' container task and get its children
    $AllTasks = if ($DirectChildren) { @($DirectChildren) } else { @() }
    
    $DevTask = $DirectChildren | Where-Object { $_."CoreField.Title" -eq "Development" }
    if ($DevTask) {
        $DevTaskId = $DevTask[0]."CoreField.Identifier"
        Write-Host "  Found Development container: $DevTaskId" -ForegroundColor Gray
        $DevChildren = Search-OLTask -Query "Parentfolderidentifier:(`"$DevTaskId`")" -Token $Token -ApiUrl $ApiUrl
        if ($DevChildren) {
            $AllTasks += $DevChildren
        }
    }

    # 4. Filter and Process Tasks
    $AddedCount = 0
    foreach ($Task in $AllTasks) {
        $Type = ($Task."CoreField.DocSubType").Trim()

        # Filter by Type
        if ($AllowedTypes -notcontains $Type) {
            continue
        }

        $TaskTitle = $Task."CoreField.Title"
        $Assignee = if ([string]::IsNullOrWhiteSpace($Task.AssignedTo)) { "(unassigned)" } else { $Task.AssignedTo }
        $TimeSpent = if ([string]::IsNullOrWhiteSpace($Task."Document.TimeSpentMn")) { "0" } else { $Task."Document.TimeSpentMn" }
        
        $Status = if ($Task."CoreField.Status") { ($Task."CoreField.Status").Trim() } else { "" }
        $TimeLeftIgnoredStatuses = @("Obsolete", "Duplicate", "Closed", "Needs Peer Review", "Implemented on Dev", "In Revision")
        
        if ($TimeLeftIgnoredStatuses -contains $Status) {
            $TimeLeft = "0"
        }
        else {
            $TimeLeft = if ([string]::IsNullOrWhiteSpace($Task."Document.TimeLeftMn")) { "0" } else { $Task."Document.TimeLeftMn" }
        }

        # Duplicate Check Key
        $RowKey = "$CaptureDate|$EnhancementTitle|$TaskTitle"

        $NewRowObject = [PSCustomObject]@{
            'Capture date'      = $CaptureDate
            'Enhancement title' = $EnhancementTitle
            'Task title'        = $TaskTitle
            'Type'              = $Type
            'Assignee'          = $Assignee
            'Time spent'        = $TimeSpent
            'Time left'         = $TimeLeft
        }

        if ($DataIndex.ContainsKey($RowKey)) {
            # Replace
            $idx = $DataIndex[$RowKey]
            $TrackingData[$idx] = $NewRowObject
            Write-Host "    Updated: $TaskTitle"
        }
        else {
            # Add
            $TrackingData += $NewRowObject
            $DataIndex[$RowKey] = $TrackingData.Count - 1
            Write-Host "    Added: $TaskTitle"
            $AddedCount++
        }
    }
    
    if ($AddedCount -eq 0) {
        Write-Host "  No new tasks added for this ticket." -ForegroundColor DarkGray
    }
}

# Save updated data
if ($TrackingData.Count -gt 0) {
    $TrackingData | Export-Csv -Path $CsvFilePath -NoTypeInformation -Encoding UTF8 -Force
}
Write-Host "Done! CSV updated at: $CsvFilePath" -ForegroundColor Cyan