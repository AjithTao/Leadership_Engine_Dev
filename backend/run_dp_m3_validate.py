# -*- coding: utf-8 -*-
"""
M3 Test:Story Ratio — Data Platform — Validation + 04/10 Report
PDF Definition: # Test Cases CREATED in PI2 / # Closed Dev Stories in PI2
PDF Reference (04/24): Tests=87, Stories=69, Ratio=1.20
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

SEP  = "=" * 110
DASH = "-" * 110

def run(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()).get("total", "ERR")
    except Exception as e:
        return f"ERR:{e}"

def build_queries(snap):
    # STORIES denominator — A5 approach (validated for M2)
    stories_jql = (
        f'{PRJ} AND issuetype = Story AND "Story Type" = Dev'
        f' AND created >= "{PI_FROM}" AND created <= "{snap} 23:59"'
        f' AND status NOT IN (Abandoned)'
        f' AND resolved <= "{snap} 23:59"'
    )
    # TESTS numerator — PDF definition: Test cases CREATED in PI2 window
    # No linking required — just issuetype=Test created in PI date range
    tests_jql_no_link = (
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND created >= "{PI_FROM}" AND created <= "{snap} 23:59"'
    )
    # Also try: Tests linked to Dev stories created in PI (our A3 from before)
    tests_jql_linked = (
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND issueFunction in linkedIssuesOf('
        f'"issuetype = Story AND \\"Story Type\\" = Dev'
        f' AND created >= \'{PI_FROM}\' AND created <= \'{snap} 23:59\'")'
    )
    return stories_jql, tests_jql_no_link, tests_jql_linked

print(SEP)
print(f"  M3 TEST:STORY RATIO  |  Data Platform  |  PI2 CY26  |  PI_FROM={PI_FROM}")
print(f"  PDF Definition: Tests CREATED in PI2  /  Closed Dev Stories in PI2")
print(f"  PDF Reference (04/24): Tests=87  Stories=69  Ratio=1.20")
print(SEP)

snaps = [
    ("2026-04-10", "04/10/2026", None, None),         # target week (no PDF ref for M3)
    ("2026-04-24", "04/24/2026", 87, 69),              # PDF reference week
]

print(f"\n  {'Snap':<12}  {'Approach':<45}  {'Tests':>7}  {'Stories':>8}  {'Ratio':>7}  {'Notes'}")
print(DASH)

for snap, label, pdf_t, pdf_s in snaps:
    stories_jql, tests_no_link, tests_linked = build_queries(snap)

    t_no  = run(tests_no_link)
    t_lnk = run(tests_linked)
    s     = run(stories_jql)

    for t_val, approach in [(t_no, "Tests CREATED in PI (no linking)"),
                             (t_lnk, "Tests LINKED to Dev stories in PI")]:
        try:
            ratio = round(int(t_val) / int(s), 2) if int(s) > 0 else 0.0
        except:
            ratio = "ERR"
        note = ""
        if pdf_t and pdf_s:
            try:
                diff_t = int(t_val) - pdf_t
                diff_s = int(s) - pdf_s
                note = f"  PDF={pdf_t}/{pdf_s}  DiffTests={diff_t:+d}  DiffStories={diff_s:+d}"
            except:
                note = ""
        print(f"  {label:<12}  {approach:<45}  {str(t_val):>7}  {str(s):>8}  {str(ratio):>7}  {note}")
    print(DASH)

print(f"\n{SEP}")
print(f"  JQL REFERENCE  |  Snap=2026-04-10  (M3 Production Queries)")
print(SEP)

snap = "2026-04-10"
stories_jql, tests_no_link, tests_linked = build_queries(snap)

print(f"""
  STORIES (Denominator) — A5 approach:
    {stories_jql}

  TESTS (Numerator) — Tests Created in PI [matches PDF definition]:
    {tests_no_link}

  TESTS (Numerator) — Tests Linked to Dev Stories in PI [alternative]:
    {tests_linked}
""")
print(SEP)
