# -*- coding: utf-8 -*-
"""
TCR Data Platform PI1 - v4
Binary search: which PI_FROM date gives Total=220, Yes=82 for 03/13 A3?
Also test if the "Yes" is filtered differently (no status/resolved filter on Yes JQL)
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

SNAP_313 = "2026-03-13"
SNAP_306 = "2026-03-06"

SEP  = "=" * 80
DASH = "-" * 80

def run(jql, fetch=500):
    payload = json.dumps({"jql": jql, "maxResults": fetch,
                          "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            d = json.loads(r.read())
            return d.get("total", "ERR")
    except Exception as e:
        return f"ERR:{e}"

def a3_total(pi_from, snap):
    return (f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
            f'AND created >= "{pi_from}" AND created <= "{snap} 23:59" '
            f'AND status IN ("Accepted","Test Complete","Done") '
            f'AND resolved <= "{snap} 23:59"')

print(SEP)
print("TCR V4 | Finding PI_FROM that gives Total=220 (A3 filter, snap=03/13)")
print(SEP)

# Test weekly PI start dates from 2026-01-01 to 2026-02-15
pi_starts = [
    "2026-01-01","2026-01-05","2026-01-06","2026-01-07","2026-01-12",
    "2026-01-13","2026-01-14","2026-01-19","2026-01-20","2026-01-21",
    "2026-01-26","2026-01-27","2026-02-01","2026-02-02","2026-02-03",
    "2026-02-08","2026-02-09","2026-02-10","2026-02-13","2026-02-14",
    "2026-02-15","2026-02-16","2026-02-17",
]

print(f"\n{'PI_FROM':<14}  {'Total(03/13)':>12}  {'Total(03/06)':>12}  {'Diff from 220':>14}")
print(DASH)

for pi_from in pi_starts:
    t313 = run(a3_total(pi_from, SNAP_313))
    try:
        diff = int(t313) - 220
        marker = " <<< TARGET" if abs(diff) <= 5 else ""
        print(f"  {pi_from:<14}  {str(t313):>12}  {'':>12}  {diff:>+14}{marker}")
    except:
        print(f"  {pi_from:<14}  {str(t313):>12}")

print(f"\n{DASH}")
print("Now finding which PI_FROM gives Total=220 with Yes=82 as well:")
print(f"{'PI_FROM':<14}  {'Total':>7}  {'Yes':>5}  {'Pct':>8}  {'TargetDiff':>12}")

for pi_from in pi_starts:
    base = a3_total(pi_from, SNAP_313)
    yes_jql = base + ' AND "Test Case Reviewed" = Yes'
    t = run(base)
    y = run(yes_jql)
    try:
        it = int(t); iy = int(y)
        pct = round(iy/it*100,1) if it > 0 else 0
        td = it - 220; yd = iy - 82
        marker = " <<< MATCH" if abs(td) <= 5 and abs(yd) <= 5 else (
                 " << close" if abs(td) <= 15 and abs(yd) <= 15 else "")
        print(f"  {pi_from:<14}  {it:>7}  {iy:>5}  {str(pct)+'%':>8}  {td:>+6}/{yd:>+6}{marker}")
    except:
        print(f"  {pi_from:<14}  ERR")

print(f"\n{SEP}")
print("ALTERNATE YES CALCULATION: What if Yes uses NO status/resolved filter?")
print(f"Yes_Alt = project IN (...) AND created >= PI_FROM AND created <= SNAP AND 'Test Case Reviewed' = Yes")
print(SEP)

PI_FROM_MAIN = "2026-01-01"
base_a3 = a3_total(PI_FROM_MAIN, SNAP_313)
yes_alt = (f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
           f'AND created >= "{PI_FROM_MAIN}" AND created <= "{SNAP_313} 23:59" '
           f'AND "Test Case Reviewed" = Yes')
yes_alt_closed = (f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
                  f'AND created >= "{PI_FROM_MAIN}" AND created <= "{SNAP_313} 23:59" '
                  f'AND status IN ("Accepted","Test Complete","Done") '
                  f'AND "Test Case Reviewed" = Yes')

t_a3 = run(base_a3)
y_alt = run(yes_alt)
y_alt_closed = run(yes_alt_closed)

print(f"  A3 Total (created+closed+resolved)      : {t_a3}")
print(f"  Yes_Alt (created only, any status)       : {y_alt}")
print(f"  Yes_Alt_Closed (created+closed, no res.) : {y_alt_closed}")
print(f"  PDF target Yes                           : 82")

# Check for the 03/06 snapshot too
base_a3_306 = a3_total(PI_FROM_MAIN, SNAP_306)
yes_alt_306 = (f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
               f'AND created >= "{PI_FROM_MAIN}" AND created <= "{SNAP_306} 23:59" '
               f'AND "Test Case Reviewed" = Yes')
t_a3_306 = run(base_a3_306)
y_alt_306 = run(yes_alt_306)
print(f"\n  A3 Total (03/06)                         : {t_a3_306}")
print(f"  Yes_Alt (created only) (03/06)           : {y_alt_306}")

print(f"\n{SEP}")
