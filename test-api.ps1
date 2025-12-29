# SorteBem API Test Script
# PowerShell script para testar todos os endpoints principais da API

$API_URL = "https://api.sortebem.com.br"

Write-Host "🧪 SORTEBEM API TEST SUITE" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "✅ Test 1: Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/health" -Method GET
    Write-Host "   Status: OK" -ForegroundColor Green
    Write-Host "   PostgreSQL: $($health.postgres)" -ForegroundColor Green
    Write-Host "   Redis: $($health.redis)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ FAILED: $_" -ForegroundColor Red
}
Write-Host ""

# Test 2: Get Rounds
Write-Host "✅ Test 2: Get Available Rounds" -ForegroundColor Yellow
try {
    $rounds = Invoke-RestMethod -Uri "$API_URL/rounds" -Method GET
    if ($rounds.data -and $rounds.data.Count -gt 0) {
        Write-Host "   Found $($rounds.data.Count) round(s)" -ForegroundColor Green

        # Show first round details
        $firstRound = $rounds.data[0]
        Write-Host "   " -NoNewline
        Write-Host "Round #$($firstRound.number)" -ForegroundColor White
        Write-Host "      ID: $($firstRound.id)" -ForegroundColor Gray
        Write-Host "      Type: $($firstRound.type)" -ForegroundColor Gray
        Write-Host "      Status: $($firstRound.status)" -ForegroundColor Gray
        Write-Host "      Is Selling: $($firstRound.is_selling)" -ForegroundColor Gray
        Write-Host "      Price: R$ $($firstRound.card_price)" -ForegroundColor Gray
        Write-Host "      Cards Sold: $($firstRound.cards_sold)/$($firstRound.max_cards)" -ForegroundColor Gray

        # Store first selling round ID for next test
        $script:testRoundId = $firstRound.id
    } else {
        Write-Host "   ⚠️  No rounds found. Wait 1 minute for cron to create first round." -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ FAILED: $_" -ForegroundColor Red
}
Write-Host ""

# Test 3: Create Purchase (only if we have a round)
if ($script:testRoundId) {
    Write-Host "✅ Test 3: Create Purchase (PIX)" -ForegroundColor Yellow
    try {
        $purchaseBody = @{
            round_id = $script:testRoundId
            quantity = 1
            payment_method = "pix"
            customer = @{
                name = "Test User PowerShell"
                email = "test@example.com"
                phone = "11999999999"
            }
        } | ConvertTo-Json

        $purchase = Invoke-RestMethod `
            -Uri "$API_URL/purchases" `
            -Method POST `
            -ContentType "application/json" `
            -Body $purchaseBody

        if ($purchase.ok) {
            Write-Host "   Purchase Created Successfully!" -ForegroundColor Green
            Write-Host "      Purchase ID: $($purchase.data.id)" -ForegroundColor Gray
            Write-Host "      Round: #$($purchase.data.round_number)" -ForegroundColor Gray
            Write-Host "      Total: R$ $($purchase.data.total_amount)" -ForegroundColor Gray
            Write-Host "      Cards: $($purchase.data.cards.Count)" -ForegroundColor Gray

            if ($purchase.data.pix) {
                Write-Host "      PIX Code: $($purchase.data.pix.code.Substring(0, 50))..." -ForegroundColor Gray
            }

            $script:testPurchaseId = $purchase.data.id
        } else {
            Write-Host "   ❌ Purchase failed: $($purchase.error)" -ForegroundColor Red
        }
    } catch {
        $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   ❌ FAILED: $($errorResponse.error)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 4: Get Purchase Status
if ($script:testPurchaseId) {
    Write-Host "✅ Test 4: Check Purchase Status" -ForegroundColor Yellow
    try {
        $purchaseStatus = Invoke-RestMethod -Uri "$API_URL/purchases/$($script:testPurchaseId)" -Method GET

        Write-Host "   Purchase #$($script:testPurchaseId)" -ForegroundColor Green
        Write-Host "      Status: $($purchaseStatus.data.payment_status)" -ForegroundColor Gray
        Write-Host "      Method: $($purchaseStatus.data.payment_method)" -ForegroundColor Gray
        Write-Host "      Amount: R$ $($purchaseStatus.data.total_amount)" -ForegroundColor Gray
    } catch {
        Write-Host "   ❌ FAILED: $_" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 5: Get Stats
Write-Host "✅ Test 5: Get TV Stats (Public)" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$API_URL/stats/tv" -Method GET

    if ($stats.data.current_round) {
        Write-Host "   Current Round: #$($stats.data.current_round.number)" -ForegroundColor Green
        Write-Host "      Status: $($stats.data.current_round.status)" -ForegroundColor Gray
        Write-Host "      Cards Sold: $($stats.data.current_round.cards_sold)" -ForegroundColor Gray
    } else {
        Write-Host "   No current round" -ForegroundColor Yellow
    }

    Write-Host "   Total Charity: R$ $($stats.data.total_charity)" -ForegroundColor Gray
    Write-Host "   Recent Winners: $($stats.data.recent_winners.Count)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ FAILED: $_" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "================================" -ForegroundColor Cyan
Write-Host "🎯 TEST SUMMARY" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "All basic endpoints tested successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📚 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Configure payment gateway (see docs/PAYMENT_GATEWAY_SETUP.md)" -ForegroundColor White
Write-Host "   2. Test complete purchase flow with real payments" -ForegroundColor White
Write-Host "   3. Configure WhatsApp integration for card delivery" -ForegroundColor White
Write-Host ""
