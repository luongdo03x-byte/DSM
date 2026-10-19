# TikTok Direct Post audit

Status: BLOCKED_EXTERNAL. A repository test cannot verify TikTok's review decision or ownership of the public media domain.

## Prepare the submission

1. Configure the TikTok Login Kit client, redirect URI, and Content Posting API scopes (`user.info.basic`, `video.publish`). Connect a creator account through the app.
2. Record a demo showing account connection, a fresh `creator_info` request, the privacy selector with no default, creator controlled comment, Duet and Stitch switches, and the Direct Post flow. Show a private post while the app is unaudited.
3. Capture screenshots of the privacy selector and the unaudited notice. The app must offer only `SELF_ONLY` until Direct Post is approved.
4. For photo posts, configure `PUBLIC_MEDIA_BASE_URL` as an HTTPS origin and complete TikTok's media domain verification. Confirm every photo URL resolves publicly on that domain and that `PULL_FROM_URL` can fetch it.
5. Provide the final owner approved Privacy Policy, Terms, and Data Deletion pages. These remain pending from SP4; do not submit placeholder legal copy.
6. Submit the demo, screenshots, domain details, and policy links through TikTok's developer portal. Set `TIKTOK_DIRECT_POST_APPROVED=1` only after approval is confirmed.

## Live smoke after approval

Use a dedicated authorized creator account. Submit one video with FILE_UPLOAD and one photo album from the verified domain. Confirm status polling reaches `PUBLISH_COMPLETE`; confirm the public URL only when TikTok returns a public post ID. Keep a private post without a public URL marked published. Record results in `docs/verification/v1-acceptance.md`.
