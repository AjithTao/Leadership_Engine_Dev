# -*- coding: utf-8 -*-
"""
Test Case Review Status - Data Platform - PI1 CY26 - Investigation v2
Try resolved-date variants to narrow down what gives Total=220, Yes=82 for 03/13
"""
import os
import urllib.request, json, sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json", "Content-Type": "application/json"}

DP = [
    "MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
    "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
    "TDO","TDOPS","TDP","TDQ","UDC","UDI"
]
PROJECTS = ",".join(f'"{p}"' for p in DP)

PI_FROM  = "2026-01-01"
SNAP_306 = "2026-03-06"
SNAP_313 = "2026-03-13"

def run(jql, fetch=500):
    payload = json.dumps({"jql": jql, "maxResults": fetch,
                          "fields": ["summary","status","key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            d = json.loads(r.read())
            return d.get("total", "ERR"), [i["key"] for i in d.get("issues", [])]
    except Exception as e:
        return f"ERR:{e}", []

SEP  = "=" * 80
DASH = "-" * 80

print(SEP)
print("TCR INVESTIGATION V2 | Data Platform | PI1 CY26 | Finding Total=220, Yes=82")
print(SEP)
print("PDF TARGET (03/13): Total=220, Yes=82, 37%")
print("Previous A1 (created+closed): 357 total, 169 yes  -- overshoot +137")
print("Previous A2 (NOT Abandoned):  461 total, 183 yes  -- overshoot +241")
print(SEP)

# Approach A3: created in PI1 + closed status + resolved <= snap (both filters)
# Hypothesis: PDF may have used resolved date to further restrict
A3_BASE_313 = (
    f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
    f'AND status IN ("Accepted","Test Complete","Done") '
    f'AND resolved <= "{SNAP_313} 23:59"'
)
A3_YES_313 = A3_BASE_313 + ' AND "Test Case Reviewed" = Yes'

# Approach A4: resolved date IN PI1 window (no created filter) + closed status
A4_BASE_313 = (
    f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    f'AND status IN ("Accepted","Test Complete","Done") '
    f'AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP_313} 23:59"'
)
A4_YES_313 = A4_BASE_313 + ' AND "Test Case Reviewed" = Yes'

# Approach A5: resolved date IN PI1 + NOT Abandoned
A5_BASE_313 = (
    f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    f'AND status NOT IN (Abandoned) '
    f'AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP_313} 23:59"'
)
A5_YES_313 = A5_BASE_313 + ' AND "Test Case Reviewed" = Yes'

# Approach A6: resolutiondate instead of resolved
A6_BASE_313 = (
    f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
    f'AND status IN ("Accepted","Test Complete","Done") '
    f'AND resolutiondate <= "{SNAP_313} 23:59"'
)
A6_YES_313 = A6_BASE_313 + ' AND "Test Case Reviewed" = Yes'

# Approach A7: resolutiondate IN PI1 (no created filter)
A7_BASE_313 = (
    f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    f'AND status IN ("Accepted","Test Complete","Done") '
    f'AND resolutiondate >= "{PI_FROM}" AND resolutiondate <= "{SNAP_313} 23:59"'
)
A7_YES_313 = A7_BASE_313 + ' AND "Test Case Reviewed" = Yes'

# Approach A8: statusCategory = Done + created in PI1
A8_BASE_313 = (
    f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
    f'AND statusCategory = Done'
)
A8_YES_313 = A8_BASE_313 + ' AND "Test Case Reviewed" = Yes'

# Approach A9: status changed to Done/Accepted/Test Complete BEFORE snap (sprint closure)
A9_BASE_313 = (
    f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
    f'AND status WAS IN ("Accepted","Test Complete","Done") BEFORE "{SNAP_313} 23:59"'
)
A9_YES_313 = A9_BASE_313 + ' AND "Test Case Reviewed" = Yes'

approaches = [
    ("A3 (created+closed+resolved<=snap)",   A3_BASE_313, A3_YES_313),
    ("A4 (resolved in PI1, closed status)",  A4_BASE_313, A4_YES_313),
    ("A5 (resolved in PI1, NOT Abandoned)",  A5_BASE_313, A5_YES_313),
    ("A6 (created+closed+resolutiondate)",   A6_BASE_313, A6_YES_313),
    ("A7 (resolutiondate in PI1, closed)",   A7_BASE_313, A7_YES_313),
    ("A8 (statusCategory=Done, PI1 created)",A8_BASE_313, A8_YES_313),
    ("A9 (status WAS closed BEFORE snap)",   A9_BASE_313, A9_YES_313),
]

print(f"\nTesting 7 approaches for week 03/13 against PDF targets (Total=220, Yes=82):\n")
print(f"  {'Approach':<42}  {'Total':>7}  {'Yes':>5}  {'Pct':>8}  {'TotalDiff':>10}  {'YesDiff':>8}")
print(f"  {'-'*42}  {'-'*7}  {'-'*5}  {'-'*8}  {'-'*10}  {'-'*8}")
print(f"  {'PDF Reference':<42}  {'220':>7}  {'82':>5}  {'37.0%':>8}  {'':>10}  {'':>8}")

for label, base, yes_jql in approaches:
    total, _ = run(base)
    yes, _   = run(yes_jql)
    try:
        t = int(total); y = int(yes)
        pct = round(y/t*100, 1) if t > 0 else 0.0
        td  = t - 220
        yd  = y - 82
        marker = " <-- CLOSEST" if abs(td) < 30 else ""
        print(f"  {label:<42}  {t:>7}  {y:>5}  {str(pct)+'%':>8}  {td:>+10}  {yd:>+8}{marker}")
    except:
        print(f"  {label:<42}  {'ERR':>7}")

print()
print(SEP)

# Now also check 03/06 for the winning approaches
print("\nAlso checking 03/06 for comparison (PDF: 38% coverage):\n")

A3_BASE_306 = A3_BASE_313.replace(SNAP_313, SNAP_306).replace(SNAP_313, SNAP_306)
A4_BASE_306 = A4_BASE_313.replace(SNAP_313, SNAP_306)
A6_BASE_306 = A6_BASE_313.replace(SNAP_313, SNAP_306)

for label, base in [
    ("A3 06 (created+closed+resolved)", A3_BASE_306),
    ("A4 06 (resolved in PI1, closed)",  A4_BASE_306),
    ("A6 06 (created+closed+resdate)",   A6_BASE_306),
]:
    total, _ = run(base)
    yes_jql  = base + ' AND "Test Case Reviewed" = Yes'
    yes, _   = run(yes_jql)
    try:
        t = int(total); y = int(yes)
        pct = round(y/t*100, 1) if t > 0 else 0.0
        print(f"  {label:<42}  Total={t}  Yes={y}  Pct={pct}%")
    except:
        print(f"  {label:<42}  ERR")

print()
print(SEP)
print("GOAL: Find approach where Total ~= 220 and Yes ~= 82 for 03/13")
print(SEP)
