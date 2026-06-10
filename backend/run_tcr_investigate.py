# -*- coding: utf-8 -*-
"""
Deep investigation: why live=4 vs PDF=17 for Test Case Review metric.
Runs 8 targeted diagnostic queries.
"""
import os
import urllib.request, json, sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json", "Content-Type": "application/json"}

PROJECTS = '"NDP","NPS","DNADEDGE","APITRON","DET","WRAAP","WRP"'
PI_FROM  = "2026-04-01"
SNAP     = "2026-04-10"

def run(label, jql, fetch=20):
    payload = json.dumps({"jql": jql, "maxResults": fetch,
                          "fields": ["summary","status","resolutiondate","resolved","created"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read())
            total = d.get("total", "ERR")
            keys  = [i["key"] for i in d.get("issues", [])]
            return total, keys
    except Exception as e:
        return f"ERR:{e}", []

SEP = "=" * 75

print(SEP)
print("DIAGNOSTIC — Finding PDF=17 gap for Test Case Review Status")
print(SEP)

tests = [
    # D1: What does Block C contain project by project?
    ("D1: NDP only - PI2 closed dev stories (no resolved)",
     f'project = "NDP" AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
     f'AND status IN ("Accepted","Test Complete","Done")'),

    ("D2: NPS only - PI2 closed dev stories (no resolved)",
     f'project = "NPS" AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
     f'AND status IN ("Accepted","Test Complete","Done")'),

    ("D3: WRP only - PI2 closed dev stories (no resolved)",
     f'project = "WRP" AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
     f'AND status IN ("Accepted","Test Complete","Done")'),

    ("D4: APITRON only - PI2 closed dev stories (no resolved)",
     f'project = "APITRON" AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
     f'AND status IN ("Accepted","Test Complete","Done")'),

    ("D5: DET only - PI2 closed dev stories (no resolved)",
     f'project = "DET" AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
     f'AND status IN ("Accepted","Test Complete","Done")'),

    # D6: Try resolutiondate field instead of resolved
    ("D6: USER KEYS + resolutiondate <= snap (different field)",
     f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
     f'AND status IN ("Accepted","Test Complete","Done") '
     f'AND resolutiondate <= "{SNAP} 23:59"'),

    # D7: No created filter — all-time closed dev stories resolved in PI2 window
    ("D7: No created filter, resolved in PI2 window",
     f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
     f'AND status IN ("Accepted","Test Complete","Done") '
     f'AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"'),

    # D8: No created filter — all-time closed dev stories resolutiondate in PI2 window
    ("D8: No created filter, resolutiondate in PI2 window",
     f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
     f'AND status IN ("Accepted","Test Complete","Done") '
     f'AND resolutiondate >= "{PI_FROM}" AND resolutiondate <= "{SNAP} 23:59"'),

    # D9: statusCategory = Done (broader than specific status names)
    ("D9: statusCategory = Done (no resolved), PI2 created",
     f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
     f'AND statusCategory = Done'),

    # D10: All dev stories created in PI2 regardless of status
    ("D10: ALL dev stories created in PI2 (any status)",
     f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'),

    # D11: Check if WRAAP is a valid project (might be DNADDX)
    ("D11: WRAAP project exists?",
     f'project = "WRAAP" AND issuetype = Story ORDER BY created DESC'),

    ("D12: DNADDX project closed dev stories (alternative to WRAAP)",
     f'project = "DNADDX" AND issuetype = Story AND "Story Type" = Dev '
     f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
     f'AND status IN ("Accepted","Test Complete","Done")'),
]

proj_totals = {}
for label, jql in tests:
    count, keys = run(label, jql, fetch=50)
    # Collect per-project breakdown from D1-D5
    for p in ["NDP","NPS","WRP","APITRON","DET"]:
        if f"D{['NDP','NPS','WRP','APITRON','DET'].index(p)+1}:" in label[:4]:
            proj_totals[p] = count
    print(f"\n{label}")
    print(f"  Count : {count}")
    if keys:
        print(f"  Keys  : {', '.join(keys[:30])}")
    print(f"  JQL   : {jql[:180]}")

# Project breakdown summary
print()
print(SEP)
print("PER-PROJECT BREAKDOWN (Block C — no resolved filter)")
print(SEP)
for p, c in proj_totals.items():
    print(f"  {p:<15} : {c}")

total_manual = sum(int(v) for v in proj_totals.values() if str(v).isdigit())
print(f"  {'TOTAL (D1-D5)':<15} : {total_manual}")
print()
print("PDF says: 17 total closed dev stories for Data Solutions (04/10)")
print()
print("HYPOTHESIS:")
print("  If 'resolved' filter removes stories where resolved field is empty")
print("  and the PDF was generated WITHOUT the resolved filter,")
print("  the discrepancy (40 live vs 17 PDF) may indicate:")
print("  1. WRAAP is not a valid project key (use DNADDX instead)")
print("  2. The PDF used a different PI start (e.g., sprint-level not PI-level)")
print("  3. Some projects had different project keys at time of PDF generation")
print(SEP)
