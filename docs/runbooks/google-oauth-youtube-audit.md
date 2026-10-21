# Google OAuth and YouTube API audit

Status: BLOCKED_EXTERNAL. The repository implements and tests the flow locally; approval and live publication require action by the repository owner.

## Prepare the Google Cloud project

1. Configure the OAuth consent screen, authorized redirect URI, support contact, verified domain, and the `youtube.upload` and `youtube.readonly` scopes. Request offline access so DSM can refresh tokens.
2. Provide the owner approved Privacy Policy, Terms, and Data Deletion pages. These texts are still outstanding from SP4; do not submit placeholder legal content.
3. Record a demo of Google authorization, channel selection, Composer settings, a long video, a vertical Short, resumable upload after a network interruption, and a scheduled private upload. Include the disclosure that an unaudited YouTube project keeps videos private.
4. Prepare the YouTube API Services audit package and submit it through the project owner's Google Cloud account. Record submission IDs and dates in the acceptance document. Set `YOUTUBE_API_AUDITED=1` only after approval is confirmed.
5. Configure `YOUTUBE_DAILY_UPLOAD_LIMIT` for the project's accepted allocation. DSM counts `videos.insert` attempts per Pacific calendar day and defers further jobs to 00:05 Pacific after the limit.

## Live smoke after approval

Use an authorized test channel. Upload one long video and one vertical video of at most 180 seconds. Confirm title, description, tags, category, privacy, playlist, optional custom thumbnail, and public URLs. Interrupt a large upload, restart the worker, and confirm the same resumable session completes without a duplicate video. Schedule a video more than 15 minutes ahead, then move the scheduled time and confirm `videos.update` changes `publishAt` without another upload. Record the test IDs and outcomes in `docs/verification/v1-acceptance.md`.

Reference: [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [YouTube resumable upload](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol), [YouTube quota costs](https://developers.google.com/youtube/v3/determine_quota_cost).
