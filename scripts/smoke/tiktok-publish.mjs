if(process.env.LIVE_TIKTOK_SMOKE!=='1'){console.log('TikTok live smoke skipped: set LIVE_TIKTOK_SMOKE=1 after app approval and test-account connection.');process.exit(0)}
console.log('TikTok live smoke enabled. Confirm Creator Info, app audit/direct-post approval, verified media prefix, then publish fixture and record publish_id/status in acceptance evidence.');
