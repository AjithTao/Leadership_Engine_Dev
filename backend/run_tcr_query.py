# -*- coding: utf-8 -*-
"""
Test Case Review Status - JQL executor for Data Solutions
Compares live Jira results vs PDF reference values.
Run with:  py run_tcr_query.py
"""
import os
import urllib.request, json, sys

# Force UTF-8 output so special chars don't crash on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept":        "application/json",
    "Content-Type":  "application/json",
}

# Projects from user's image (Data Solutions)
PROJECTS = '"NDP","NPS","DNADEDGE","APITRON","DET","WRAAP","WRP"'

# Also try the portfolio_mapping.py list to see difference
PROJECTS_MAP = '"NDP","SSBYOD","DNACS","NPS","DNADEDGE","DNADDX","APITRON","DET","WRP"'

PI_FROM  = "2026-04-01"   # PI2 CY26 start
SNAP_410 = "2026-04-10"   # week-ending from the PDF


def base_jql(snap, projects=PROJECTS):
    return (
        f'project IN ({projects}) '
        f'AND issuetype = Story AND "Story Type" = Dev '
        f'AND created >= "{PI_FROM}" AND created <= "{snap} 23:59" '
        f'AND status IN ("Accepted", "Test Complete", "Done") '
        f'AND resolved <= "{snap} 23:59"'
    )

def run_jql(label, jql, fetch_keys=False):
    max_r = 50 if fetch_keys else 0
    payload = json.dumps({
        "jql": jql,
        "maxResults": max_r,
        "fields": ["summary", "status", "key", "assignee"]
    }).encode()
    req = urllib.request.Request(
        f"{JIRA_URL}/rest/api/2/search",
        data=payload, headers=HEADERS, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data  = json.loads(resp.read())
            total = data.get("total", "ERR")
            keys  = [i["key"] for i in data.get("issues", [])[:20]] if fetch_keys else []
            return total, keys
    except Exception as e:
        return f"ERROR: {e}", []


SEP  = "=" * 75
DASH = "-" * 75

print(SEP)
print("METRIC 2 -- TEST CASE REVIEW STATUS  |  Data Solutions")
print(f"User Projects : {PROJECTS}")
print(f"PI2 CY26 from : {PI_FROM}  |  Snapshot week-ending: {SNAP_410}")
print(SEP)

# ──────────────────────────────────────────────────────────────
# BLOCK A : Queries with USER-PROVIDED project keys
# ──────────────────────────────────────────────────────────────
print("\n[BLOCK A] Using USER PROJECT KEYS:", PROJECTS)
print(DASH)

q_total_user = base_jql(SNAP_410, PROJECTS)
q_yes_user   = q_total_user + ' AND "Test Case Reviewed" = Yes'
q_no_user    = q_total_user + ' AND "Test Case Reviewed" != Yes'

total_u, keys_u = run_jql("Total Closed Dev Stories", q_total_user, fetch_keys=True)
yes_u,   _      = run_jql("Reviewed = Yes",            q_yes_user)
no_u,    _      = run_jql("Reviewed != Yes",            q_no_user)

print(f"  Total Closed Dev Stories : {total_u}")
print(f"  Reviewed = Yes           : {yes_u}")
print(f"  Reviewed != Yes          : {no_u}")
if keys_u:
    print(f"  Story Keys (first 20)    : {', '.join(keys_u)}")
try:
    pct_u = round(int(yes_u) / int(total_u) * 100, 1) if int(total_u) > 0 else 0.0
    print(f"  Review Coverage %%        : {pct_u}%")
except:
    print("  Review Coverage %%        : N/A")

# ──────────────────────────────────────────────────────────────
# BLOCK B : Queries with PORTFOLIO_MAPPING project keys (to find diff)
# ──────────────────────────────────────────────────────────────
print()
print("[BLOCK B] Using PORTFOLIO_MAPPING KEYS:", PROJECTS_MAP)
print(DASH)

q_total_map = base_jql(SNAP_410, PROJECTS_MAP)
q_yes_map   = q_total_map + ' AND "Test Case Reviewed" = Yes'

total_m, keys_m = run_jql("Total Closed Dev Stories", q_total_map, fetch_keys=True)
yes_m,   _      = run_jql("Reviewed = Yes",            q_yes_map)

print(f"  Total Closed Dev Stories : {total_m}")
print(f"  Reviewed = Yes           : {yes_m}")
if keys_m:
    print(f"  Story Keys (first 20)    : {', '.join(keys_m)}")
try:
    pct_m = round(int(yes_m) / int(total_m) * 100, 1) if int(total_m) > 0 else 0.0
    print(f"  Review Coverage %%        : {pct_m}%")
except:
    print("  Review Coverage %%        : N/A")

# ──────────────────────────────────────────────────────────────
# BLOCK C : WITHOUT "resolved" filter (to see if that's the gap)
# ──────────────────────────────────────────────────────────────
print()
print("[BLOCK C] WITHOUT resolved filter (user keys) -- to detect date-field gap")
print(DASH)

q_no_resolved = (
    f'project IN ({PROJECTS}) '
    f'AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP_410} 23:59" '
    f'AND status IN ("Accepted", "Test Complete", "Done")'
)
total_c, keys_c = run_jql("Total (no resolved filter)", q_no_resolved, fetch_keys=True)
print(f"  Total Closed Dev Stories (no resolved) : {total_c}")
if keys_c:
    print(f"  Story Keys: {', '.join(keys_c)}")

# ──────────────────────────────────────────────────────────────
# BLOCK D : PDF reference uses "resolved" possibly broader -- try updatedDate
# ──────────────────────────────────────────────────────────────
print()
print("[BLOCK D] Using updatedDate instead of resolved (user keys)")
print(DASH)

q_updated = (
    f'project IN ({PROJECTS}) '
    f'AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP_410} 23:59" '
    f'AND status IN ("Accepted", "Test Complete", "Done") '
    f'AND updated <= "{SNAP_410} 23:59"'
)
total_d, keys_d = run_jql("Total (updatedDate filter)", q_updated, fetch_keys=True)
print(f"  Total Closed Dev Stories (updatedDate) : {total_d}")
if keys_d:
    print(f"  Story Keys: {', '.join(keys_d)}")

# ──────────────────────────────────────────────────────────────
# BLOCK E : No date filter at all on status (all PI2 closed stories up to snap)
# ──────────────────────────────────────────────────────────────
print()
print("[BLOCK E] All PI2 closed dev stories up to 04/10, no resolved clause")
print(DASH)

# This mirrors how the PDF might have counted (just PI created + closed status)
q_simple = (
    f'project IN ({PROJECTS}) '
    f'AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP_410} 23:59" '
    f'AND status IN ("Accepted", "Test Complete", "Done", "Closed", "Resolved")'
)
total_e, keys_e = run_jql("Total (broader status, no resolved)", q_simple, fetch_keys=True)
print(f"  Total Closed Dev Stories (broader status) : {total_e}")
if keys_e:
    print(f"  Story Keys: {', '.join(keys_e)}")

# ──────────────────────────────────────────────────────────────
# FINAL COMPARISON
# ──────────────────────────────────────────────────────────────
print()
print(SEP)
print("FINAL COMPARISON vs PDF (04/10/2026 report)")
print(SEP)
print(f"  {'Source':<40} {'Total':>7}  {'Yes':>5}  {'Coverage':>10}")
print(f"  {DASH[:60]}")
print(f"  {'PDF Reference (04/10)':<40} {'17':>7}  {'0':>5}  {'0.0%':>10}")
try:
    print(f"  {'LIVE Block A (user project keys)':<40} {str(total_u):>7}  {str(yes_u):>5}  {str(pct_u)+'%':>10}")
except: pass
try:
    print(f"  {'LIVE Block B (portfolio_mapping keys)':<40} {str(total_m):>7}  {str(yes_m):>5}  {str(pct_m)+'%':>10}")
except: pass
print()
print("KEY DIFFERENCES:")
try:
    diff_a = int(total_u) - 17
    diff_b = int(total_m) - 17
    print(f"  Block A vs PDF total stories : {diff_a:+d}")
    print(f"  Block B vs PDF total stories : {diff_b:+d}")
except: pass
print()
print("JQL USED (Block A - final):")
print(f"  TOTAL : {q_total_user}")
print(f"  YES   : {q_yes_user}")
print(SEP)
