# -*- coding: utf-8 -*-
"""
M3 Test:Story Ratio — Data Platform — 6 Approaches
PI2 CY26: PI_FROM=2026-04-01, SNAP=2026-04-10
issuetype = Test  (confirmed by user)
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
P   = ",".join(f'"{x}"' for x in DP)
PRJ = f'project IN ({P})'

PI_FROM = "2026-04-01"
SNAP    = "2026-04-10"

SEP  = "=" * 115
DASH = "-" * 115

def run(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()).get("total", "ERR")
    except Exception as e:
        return f"ERR:{e}"

# ── Story denominators ────────────────────────────────────────────────────────
# S_OLD  : A1 style  — created in PI + closed statuses + resolved <= snap
# S_A5   : A5 style  — created in PI + NOT Abandoned  + resolved <= snap
S_OLD = (f'{PRJ} AND issuetype = Story AND "Story Type" = Dev'
         f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
         f' AND status IN ("Accepted","Test Complete","Done")'
         f' AND resolved <= "{SNAP} 23:59"')

S_A5  = (f'{PRJ} AND issuetype = Story AND "Story Type" = Dev'
         f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
         f' AND status NOT IN (Abandoned)'
         f' AND resolved <= "{SNAP} 23:59"')

# ── Test case numerators ──────────────────────────────────────────────────────
# Nested JQL uses single-quoted dates to avoid quote conflicts inside linkedIssuesOf("...")

# N1: current code — linked to Story/Bug/Defect (missing "Story Type"=Dev filter)
N1 = (f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
      f' AND issueFunction in linkedIssuesOf('
      f'"issuetype IN (Story, Bug, Defect)'
      f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'")')

# N2: linked to Dev stories only (fix Story Type filter), date on linked story
N2 = (f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
      f' AND issueFunction in linkedIssuesOf('
      f'"issuetype = Story AND \\"Story Type\\" = Dev'
      f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'")')

# N3: linked to A5-filtered Dev stories (full A5 in nested JQL)
N3 = (f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
      f' AND issueFunction in linkedIssuesOf('
      f'"issuetype = Story AND \\"Story Type\\" = Dev'
      f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\''
      f' AND status NOT IN (Abandoned)'
      f' AND resolved <= \'{SNAP} 23:59\'")')

# N4: date filter directly on Test (test created in PI), linked to any Dev story
N4 = (f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
      f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
      f' AND issueFunction in linkedIssuesOf('
      f'"issuetype = Story AND \\"Story Type\\" = Dev")')

# N5: linked to Dev stories resolved in snap window (no created filter on story)
N5 = (f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
      f' AND issueFunction in linkedIssuesOf('
      f'"issuetype = Story AND \\"Story Type\\" = Dev'
      f' AND status NOT IN (Abandoned)'
      f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'")')

# N6: linked to Dev stories — no date or status filter (broadest — all linked tests)
N6 = (f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
      f' AND issueFunction in linkedIssuesOf('
      f'"issuetype = Story AND \\"Story Type\\" = Dev")')

APPROACHES = [
    {
        "id": "A1",
        "label": "Current code  | Stories: OLD(closed+resolved) | Tests: linked Story/Bug/Defect created in PI",
        "story_jql": S_OLD,
        "test_jql":  N1,
    },
    {
        "id": "A2",
        "label": "Fix denominator | Stories: A5(NOT Abandoned+resolved) | Tests: linked Story/Bug/Defect created in PI",
        "story_jql": S_A5,
        "test_jql":  N1,
    },
    {
        "id": "A3",
        "label": "Fix both       | Stories: A5 | Tests: linked Dev stories created in PI",
        "story_jql": S_A5,
        "test_jql":  N2,
    },
    {
        "id": "A4",
        "label": "Full A5        | Stories: A5 | Tests: linked A5-filtered Dev stories",
        "story_jql": S_A5,
        "test_jql":  N3,
    },
    {
        "id": "A5",
        "label": "Date on Test   | Stories: A5 | Tests: Test created in PI linked to any Dev story",
        "story_jql": S_A5,
        "test_jql":  N4,
    },
    {
        "id": "A6",
        "label": "Resolved window| Stories: A5 | Tests: linked to Dev resolved in PI window",
        "story_jql": S_A5,
        "test_jql":  N5,
    },
]

print(SEP)
print(f"  M3 TEST:STORY RATIO  |  Data Platform  |  PI2 CY26  |  SNAP={SNAP}")
print(f"  PI_FROM={PI_FROM}  |  issuetype=Test for test cases")
print(SEP)
print(f"\n  Querying Jira for all 6 approaches ...\n")

results = {}
for ap in APPROACHES:
    print(f"  [{ap['id']}] stories... ", end="", flush=True)
    s = run(ap["story_jql"])
    print(f"{s}  tests... ", end="", flush=True)
    t = run(ap["test_jql"])
    try:
        ratio = round(int(t) / int(s), 2) if int(s) > 0 else 0.0
    except:
        ratio = "ERR"
    results[ap["id"]] = {"stories": s, "tests": t, "ratio": ratio}
    print(f"{t}  ratio={ratio}")

print(f"\n{SEP}")
print(f"  COMPARISON TABLE  |  M3 Test:Story Ratio  |  SNAP={SNAP}")
print(SEP)
print(f"  {'':3}  {'Approach':<70}  {'Stories':>8}  {'Tests':>7}  {'Ratio':>7}")
print(DASH)
for ap in APPROACHES:
    r = results[ap["id"]]
    print(f"  {ap['id']:<4} {ap['label']:<70}  {str(r['stories']):>8}  {str(r['tests']):>7}  {str(r['ratio']):>7}")
print(DASH)

print(f"\n{SEP}")
print(f"  JQL REFERENCE  |  PI_FROM={PI_FROM}  SNAP={SNAP}")
print(SEP)
for ap in APPROACHES:
    print(f"\n  [{ap['id']}] {ap['label'].strip()}")
    print(f"  Stories JQL: {ap['story_jql']}")
    print(f"  Tests   JQL: {ap['test_jql']}")
print(f"\n{SEP}")
