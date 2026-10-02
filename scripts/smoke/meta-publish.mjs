if(process.env.LIVE_META_SMOKE!=='1'){console.log('Meta live smoke skipped: set LIVE_META_SMOKE=1 with dedicated test account credentials.');process.exit(0)}
console.log('Meta live smoke is enabled. Run through the app publish endpoint and record sanitized post IDs in docs/verification/v1-acceptance.md.');
