# -*- coding: utf-8 -*-
"""
TCR Data Platform — New Approaches A6/A7/A8 vs PDF 04/10
PI2 CY26: PI_FROM=2026-04-01, SNAP=2026-04-10
PDF Reference: Total=20, Yes=10 (50%)
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

PI_FROM   = "2026-04-01"
SNAP      = "2026-04-10"
PDF_TOTAL = 20
PDF_YES   = 10

def run(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read()).get("total", "ERR")
    except Exception as e:
        return f"ERR:{e}"

base = f'project IN ({PROJECTS}) AND issuetype = Story'
base_dev = base + ' AND "Story Type" = Dev'
date_range = f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
resolved_snap = f'AND resolved <= "{SNAP} 23:59"'
yes_filter = 'AND "Test Case Reviewed" = Yes'

approaches = {
    # Already known — for comparison
    "A1 [known]": {
        "desc": 'created+closed+resolved<=snap  [OLD]',
        "total": f'{base_dev} {date_range} AND status IN ("Accepted","Test Complete","Done") {resolved_snap}',
    },
    "A5 [known]": {
        "desc": 'created+NOT Abandoned+resolved<=snap  [BEST SO FAR]',
        "total": f'{base_dev} {date_range} AND status NOT IN (Abandoned) {resolved_snap}',
    },
    # New approaches
    "A6": {
        "desc": 'statusCategory=Done + resolved<=snap  (catch all done statuses)',
        "total": f'{base_dev} {date_range} AND statusCategory = Done {resolved_snap}',
    },
    "A7": {
        "desc": 'No "Story Type"=Dev filter + NOT Abandoned + resolved<=snap',
        "total": f'{base} {date_range} AND status NOT IN (Abandoned) {resolved_snap}',
    },
    "A8": {
        "desc": 'Exclude Abandoned+WontDo+Duplicate+Cancelled + resolved<=snap',
        "total": f'{base_dev} {date_range} AND status NOT IN (Abandoned,"Won\'t Do",Duplicate,Cancelled) {resolved_snap}',
    },
}

SEP  = "=" * 110
DASH = "-" * 110

print(SEP)
print(f"  TCR Data Platform  |  New Approaches  |  PI2 CY26  |  SNAP={SNAP}")
print(f"  PDF Reference: Total={PDF_TOTAL}  Yes={PDF_YES}  (50.0%)")
print(SEP)

results = {}
for key, ap in approaches.items():
    total_jql = ap["total"]
    yes_jql   = total_jql + f" {yes_filter}"
    t = run(total_jql)
    y = run(yes_jql)
    try:
        pct = round(int(y) / int(t) * 100, 1) if int(t) > 0 else 0.0
        td  = int(t) - PDF_TOTAL
        yd  = int(y) - PDF_YES
    except:
        pct = td = yd = "ERR"
    results[key] = {"t": t, "y": y, "pct": pct, "td": td, "yd": yd, "desc": ap["desc"]}
    print(f"  {key:<12}  done  ->  Total={t}  Yes={y}")

print(f"\n{SEP}")
print(f"  COMPARISON TABLE  |  SNAP={SNAP}  |  PDF: Total={PDF_TOTAL}  Yes={PDF_YES}")
print(SEP)
print(f"  {'':5}  {'Approach':<55}  {'Total':>7}  {'Yes':>5}  {'Cov%':>7}  {'TotalDiff':>10}  {'YesDiff':>8}")
print(DASH)
print(f"  {'':5}  {'PDF Reference':55}  {PDF_TOTAL:>7}  {PDF_YES:>5}  {'50.0%':>7}  {'---':>10}  {'---':>8}")
print(DASH)

for key, r in results.items():
    try:
        td_str = f"{r['td']:>+10}"
        yd_str = f"{r['yd']:>+8}"
        mark   = "  <<<" if abs(r['td']) <= 2 and abs(r['yd']) <= 2 else ""
    except:
        td_str = yd_str = "   ERR"
        mark   = ""
    print(f"  {key:<5}  {r['desc']:<55}  {str(r['t']):>7}  {str(r['y']):>5}  {str(r['pct']):>6}%  {td_str}  {yd_str}{mark}")

print(DASH)

print(f"\n{SEP}")
print(f"  RANKED BY |TotalDiff| + |YesDiff|  (lower = closer to PDF)")
print(SEP)
print(f"  {'Rank':>5}  {'Approach':<12}  {'Total':>7}  {'Yes':>5}  {'|TDiff|':>8}  {'|YDiff|':>8}  {'Sum':>5}")
print(DASH)
ranked = []
for key, r in results.items():
    try:
        ranked.append((key, int(r['t']), int(r['y']), abs(r['td']), abs(r['yd']), abs(r['td'])+abs(r['yd'])))
    except:
        pass
for i, (key, t, y, atd, ayd, s) in enumerate(sorted(ranked, key=lambda x: x[5]), 1):
    mark = "  <-- BEST" if i == 1 else ""
    print(f"  {i:>5}  {key:<12}  {t:>7}  {y:>5}  {atd:>8}  {ayd:>8}  {s:>5}{mark}")
print(DASH)

print(f"\n{SEP}")
print(f"  JQL REFERENCE")
print(SEP)
for key, ap in approaches.items():
    print(f"\n  [{key}] {ap['desc']}")
    print(f"  Total: {ap['total']}")
    print(f"  Yes:   {ap['total']} {yes_filter}")
print(f"\n{SEP}")
