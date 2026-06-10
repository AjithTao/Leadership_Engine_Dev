# -*- coding: utf-8 -*-
"""
M3 — Find which test filter matches PDF reference for 04/24
PDF: Data Platform Tests=87, Stories=69, Ratio=1.20
"""
import os
import urllib.request, json, sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json", "Content-Type": "application/json"}

DP = ["MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
      "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
      "TDO","TDOPS","TDP","TDQ","UDC","UDI"]
P   = ",".join(f'"{x}"' for x in DP)
PRJ = f'project IN ({P})'

PI_FROM = "2026-04-01"
SNAP    = "2026-04-24"

PDF_TESTS   = 87
PDF_STORIES = 69

SEP  = "=" * 105
DASH = "-" * 105

def run(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()).get("total", "ERR")
    except urllib.request.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8", errors="replace"))
            msgs = body.get("errorMessages", []) + list(body.get("errors", {}).values())
            return f"ERR400: {' | '.join(str(x) for x in msgs)}"
        except:
            return f"ERR:{e}"
    except Exception as e:
        return f"ERR:{e}"

# Stories denominator — A5
stories_jql = (
    f'{PRJ} AND issuetype = Story AND "Story Type" = Dev'
    f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
    f' AND status NOT IN (Abandoned)'
    f' AND resolved <= "{SNAP} 23:59"'
)

# Different test numerator filters
# NOTE: inner JQL uses single-quoted dates to avoid conflict with outer double quotes
test_filters = {
    "T1: created in PI, no link filter": (
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
    ),
    "T2: linked to Dev stories created in PI": (
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND issueFunction in linkedIssuesOf('
        f'"issuetype = Story AND \\"Story Type\\" = Dev'
        f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'")'
    ),
    "T3: linked to A5-closed Dev stories in PI": (
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND issueFunction in linkedIssuesOf('
        f'"issuetype = Story AND \\"Story Type\\" = Dev'
        f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\''
        f' AND status NOT IN (Abandoned)'
        f' AND resolved <= \'{SNAP} 23:59\'")'
    ),
    "T4: Test created in PI + linked to any Dev story": (
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
        f' AND issueFunction in linkedIssuesOf('
        f'"issuetype = Story AND \\"Story Type\\" = Dev")'
    ),
    "T5: linked to Dev resolved in PI (no created filter on story)": (
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND issueFunction in linkedIssuesOf('
        f'"issuetype = Story AND \\"Story Type\\" = Dev'
        f' AND status NOT IN (Abandoned)'
        f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'")'
    ),
    "T6: created in PI + linked to closed Dev stories (no PI filter on story)": (
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
        f' AND issueFunction in linkedIssuesOf('
        f'"issuetype = Story AND \\"Story Type\\" = Dev'
        f' AND status NOT IN (Abandoned)'
        f' AND resolved <= \'{SNAP} 23:59\'")'
    ),
}

print(SEP)
print(f"  M3 Test Filter Validation  |  Data Platform  |  SNAP={SNAP}")
print(f"  PDF Reference: Tests={PDF_TESTS}  Stories={PDF_STORIES}  Ratio=1.20")
print(SEP)

s = run(stories_jql)
print(f"\n  Stories (denominator A5): {s}  (PDF={PDF_STORIES}  diff={int(s)-PDF_STORIES if s not in ('ERR',) and not str(s).startswith('ERR') else 'ERR':+})")
print()

print(f"  {'Filter':<55}  {'Tests':>8}  {'Ratio':>7}  {'DiffTests':>10}")
print(DASH)
print(f"  {'PDF Reference':55}  {PDF_TESTS:>8}  {'1.20':>7}  {'---':>10}")
print(DASH)

for label, jql in test_filters.items():
    t = run(jql)
    ratio = diff = ""
    try:
        ratio = f"{round(int(t)/int(s), 2):>7}"
        diff  = f"{int(t)-PDF_TESTS:>+10}"
    except:
        ratio = "    ERR"
        diff  = "       ERR"
    print(f"  {label:<55}  {str(t):>8}  {ratio}  {diff}")

print(DASH)
print(f"\n  Stories JQL: {stories_jql}")
print(SEP)

# Also run 04/10 with best candidate (T2, T3) for the report
print(f"\n  04/10 VALUES (for user report)  SNAP=2026-04-10")
print(DASH)
SNAP10 = "2026-04-10"
s10 = run(
    f'{PRJ} AND issuetype = Story AND "Story Type" = Dev'
    f' AND created >= "{PI_FROM}" AND created <= "{SNAP10} 23:59"'
    f' AND status NOT IN (Abandoned)'
    f' AND resolved <= "{SNAP10} 23:59"'
)
for label, jql_tmpl in [
    ("T2: linked to Dev stories created in PI",
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND issueFunction in linkedIssuesOf('
        f'"issuetype = Story AND \\"Story Type\\" = Dev'
        f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP10} 23:59\'")'),
    ("T3: linked to A5-closed Dev stories in PI",
        f'{PRJ} AND issuetype = Test AND status NOT IN (Abandoned)'
        f' AND issueFunction in linkedIssuesOf('
        f'"issuetype = Story AND \\"Story Type\\" = Dev'
        f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP10} 23:59\''
        f' AND status NOT IN (Abandoned)'
        f' AND resolved <= \'{SNAP10} 23:59\'")'),
]:
    t10 = run(jql_tmpl)
    try: ratio10 = round(int(t10)/int(s10), 2)
    except: ratio10 = "ERR"
    print(f"  04/10  Stories={s10}  {label}: Tests={t10}  Ratio={ratio10}")
print(SEP)
