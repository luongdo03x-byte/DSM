# Meta live smoke

Status: BLOCKED_EXTERNAL — owner test Page, token, public image URL, and approved Meta permissions are needed.

Use a dedicated test Facebook Page under the owner's Meta app. The Page token needs permission to create and delete test posts. Supply a public JPEG URL reachable by Meta. The script creates one text post and one image post, prints their links, and deletes both in a `finally` block. If cleanup fails, remove the posts manually before rerunning.

Set these environment variables in the session from a secure source; do not commit the token:

| Variable | Value |
|---|---|
| `LIVE_META_SMOKE` | `1` |
| `META_SMOKE_CONFIRM_TEST_PAGE` | `1` after checking the Page ID is a disposable test Page |
| `META_SMOKE_PAGE_ID` | Test Facebook Page ID |
| `META_SMOKE_PAGE_TOKEN` | Page access token |
| `META_SMOKE_IMAGE_URL` | Public HTTPS JPEG URL |
| `META_GRAPH_BASE_URL` | Optional Graph base URL; defaults to `https://graph.facebook.com` |
| `META_GRAPH_VERSION` | Optional version; defaults to `v24.0` |

Run `node scripts/smoke/meta-publish.mjs` from the repository root. Keep the two returned URLs and the two `deleted` lines as local evidence, then update the Facebook live publish section of `docs/verification/v1-acceptance.md`. The script's local stub test verifies the call sequence; it is not evidence of live Meta behavior.

Instagram live publish needs a separate owner controlled professional account linked to a Page and real image, carousel, Reel and Story checks. Record those results only after running against Meta.
