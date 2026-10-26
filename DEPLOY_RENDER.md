# Free Render Deployment: TAO Integrations Only

This deployment runs the FalconX frontend and API with Jira, Confluence, and
GitHub. AI and LDAP are disabled. It is intended for a proof of concept, not a
production workload.

## 1. Confirm TAO is publicly reachable

From a device that is not connected to the corporate VPN, confirm that the TAO
Jira and Confluence base URLs open. Render cannot access an endpoint that is
available only through a corporate VPN, private DNS, or an IP allowlist.

## 2. Prepare a private GitHub repository

Do not commit `backend/config/.env`. Check before pushing:

```powershell
git ls-files backend/config/.env
```

The command must print nothing. Then commit the deployment files and push them:

```powershell
git add backend frontend tests render.yaml DEPLOY_RENDER.md
git commit -m "Prepare TAO integration deployment"
git push origin main
```

## 3. Create the Render Blueprint

1. Sign in to <https://dashboard.render.com>.
2. Choose **New > Blueprint**.
3. Connect the private GitHub repository.
4. Select the branch containing `render.yaml`.
5. Render will propose `falconx-tao-api` and `falconx-tao-web`.
6. Enter the prompted secret values and apply the Blueprint.

## 4. Backend environment values

Enter these values in `falconx-tao-api`. Copy TAO URLs from the existing local
`backend/config/.env`; do not use old CDK example URLs.

| Variable | Value |
|---|---|
| `APP_ADMIN_USERNAME` | Temporary hosted login name |
| `APP_ADMIN_PASSWORD` | A new long, unique password |
| `APP_ADMIN_EMAIL` | Administrator email |
| `SESSION_SECRET_KEY` | A long random value |
| `JIRA_BASE_URL` | TAO Jira base URL |
| `JIRA_SERVICE_EMAIL` | TAO Jira service account |
| `JIRA_SERVICE_API_TOKEN` | TAO Jira token/PAT |
| `JIRA_BOARD_ID` | Optional board ID |
| `CONFLUENCE_BASE_URL` | TAO Confluence base URL |
| `CONFLUENCE_SERVICE_EMAIL` | TAO Confluence service account |
| `CONFLUENCE_SERVICE_API_TOKEN` | TAO Confluence token/PAT |
| `GITHUB_SERVICE_TOKEN` | GitHub token |
| `EXTRA_CORS_ORIGINS` | Final frontend Render URL |

Render stores secret environment values separately from the repository. Raw
service tokens can be entered in Render. If encrypted `gAAAAA...` values are
copied instead, `SESSION_SECRET_KEY` must exactly match the key used locally.
Do not add OpenAI keys. The Blueprint fixes `AI_ENABLED=false`.

## 5. Connect the frontend and backend URLs

After Render assigns URLs, configure:

```text
falconx-tao-web  NEXT_PUBLIC_API_URL=https://<actual-api-service>.onrender.com
falconx-tao-api  EXTRA_CORS_ORIGINS=https://<actual-web-service>.onrender.com
```

Do not include a trailing slash. Save both values, then manually redeploy both
services so the frontend builds with the API address.

## 6. Verify the deployment

Open these URLs in order:

```text
https://<api-service>.onrender.com/health
https://<web-service>.onrender.com
```

Sign in with `APP_ADMIN_USERNAME` and `APP_ADMIN_PASSWORD`. Login starts the
Jira, Confluence, and GitHub auto-connect operation in the background.

Verify:

```text
GET /api/jira/status
GET /api/confluence/status
GET /api/github/status
GET /api/quality/qcoe-projects
```

Then open QCOE Dashboard and QCOE Metrics and confirm that the portfolio and
project catalog loads from TAO Jira.

## 7. Expected free-tier behavior

The API sleeps after a period without inbound traffic, so the first login can
take about a minute. In-memory report jobs and dashboard runs are cleared when
the free service restarts. Do not configure more than one backend instance.

## Troubleshooting

- **CORS error:** Ensure `EXTRA_CORS_ORIGINS` exactly matches the HTTPS frontend
  URL, without a trailing slash, and redeploy the API.
- **Frontend calls localhost:** Set `NEXT_PUBLIC_API_URL` and redeploy the static
  site because public Next.js variables are embedded during its build.
- **Jira/Confluence timeout:** TAO is probably private, VPN-only, or protected by
  an IP allowlist. A public free host cannot bypass that network.
- **Credential decryption failure:** Enter raw tokens in Render or copy the exact
  local `SESSION_SECRET_KEY` with the encrypted token values.
- **Slow first request:** Wait for the free API instance to wake, then retry.
