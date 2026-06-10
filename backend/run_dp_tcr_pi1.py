# -*- coding: utf-8 -*-
"""
Test Case Review Status - Data Platform - PI1 CY26
Match PDF 03/13/2026 values:
  Data Platform: Week 03/06 -> 38%, Week 03/13 -> 37% (-1%)
  # Closed Dev Stories with Test Cases Review Filled = 82
  # Closed Dev Stories in CY26 PI1 = 220

Two approaches:
  A1: status IN ("Accepted","Test Complete","Done")  -- no resolved
  A2: status NOT IN (Abandoned)
"""
import os
import urllib.request, json, sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json", "Content-Type": "application/json"}

# Data Platform projects
DP = [
    "MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
    "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
    "TDO","TDOPS","TDP","TDQ","UDC","UDI"
]
PROJECTS = ",".join(f'"{p}"' for p in DP)

# PI1 CY26
PI_FROM  = "2026-01-01"
SNAP_306 = "2026-03-06"
SNAP_313 = "2026-03-13"

# PDF reference values
PDF = {
    "306": {"total": None, "yes": None, "pct": 38.0},  # ~84/220
    "313": {"total": 220,  "yes": 82,   "pct": 37.0},
}

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

def build_a1(snap):
    return (f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
            f'AND created >= "{PI_FROM}" AND created <= "{snap} 23:59" '
            f'AND status IN ("Accepted","Test Complete","Done")')

def build_a2(snap):
    return (f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
            f'AND created >= "{PI_FROM}" AND created <= "{snap} 23:59" '
            f'AND status NOT IN (Abandoned)')

SEP  = "=" * 80
DASH = "-" * 80

print(SEP)
print("TEST CASE REVIEW STATUS | Data Platform | PI1 CY26")
print(f"Projects ({len(DP)}): {', '.join(DP)}")
print(f"PI window: {PI_FROM} to (snapshot date)")
print(SEP)
print(f"PDF TARGETS  |  03/06 -> 38%  |  03/13 -> 220 total, 82 yes, 37%")
print(SEP)

results = {}

for snap_label, snap in [("03/06", SNAP_306), ("03/13", SNAP_313)]:
    print(f"\n{'='*35} WEEK ENDING {snap_label} {'='*35}")

    for approach, build_fn in [("A1 (Closed statuses)", build_a1),
                                ("A2 (NOT Abandoned)",  build_a2)]:
        base = build_fn(snap)
        yes_jql = base + ' AND "Test Case Reviewed" = Yes'
        no_jql  = base + ' AND "Test Case Reviewed" != Yes'

        total, keys = run(base, fetch=500)
        yes, _      = run(yes_jql)
        no,  _      = run(no_jql)

        try:
            pct = round(int(yes)/int(total)*100, 1) if int(total) > 0 else 0.0
        except: pct = "N/A"

        results[f"{snap_label}_{approach}"] = {"total": total, "yes": yes, "pct": pct}

        print(f"\n  [{approach}]")
        print(f"  Total  : {total}")
        print(f"  Yes    : {yes}")
        print(f"  No/NS  : {no}")
        print(f"  Pct    : {pct}%")
        print(f"  JQL Total : {base[:160]}")
        print(f"  JQL Yes   : {yes_jql[:160]}")

# ── PER-PROJECT breakdown for 03/13 A1 ──────────────────────────────────────
print(f"\n{SEP}")
print("PER-PROJECT BREAKDOWN  |  Week 03/13  |  Approach A1 (Closed statuses)")
print(SEP)
print(f"  {'Project':<12}  {'Total':>7}  {'Yes':>5}  {'Pct':>8}  Sample Keys")

g_total = g_yes = 0
for proj in DP:
    p_base = (f'project = "{proj}" AND issuetype = Story AND "Story Type" = Dev '
              f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
              f'AND status IN ("Accepted","Test Complete","Done")')
    p_yes_jql = p_base + ' AND "Test Case Reviewed" = Yes'
    pt, pk = run(p_base, fetch=50)
    py, _  = run(p_yes_jql)
    try:
        it = int(pt); iy = int(py)
        g_total += it; g_yes += iy
        pp = f"{round(iy/it*100,1)}%" if it > 0 else "-"
        ks = ", ".join(pk[:3]) if pk else "-"
        print(f"  {proj:<12}  {it:>7}  {iy:>5}  {pp:>8}  {ks}")
    except:
        print(f"  {proj:<12}  {'ERR':>7}")

g_pct = round(g_yes/g_total*100,1) if g_total > 0 else 0.0
print(f"  {'GRAND TOTAL':<12}  {g_total:>7}  {g_yes:>5}  {str(g_pct)+'%':>8}")

# ── PER-PROJECT breakdown for 03/13 A2 ──────────────────────────────────────
print(f"\n{SEP}")
print("PER-PROJECT BREAKDOWN  |  Week 03/13  |  Approach A2 (NOT Abandoned)")
print(SEP)
print(f"  {'Project':<12}  {'Total':>7}  {'Yes':>5}  {'Pct':>8}  Sample Keys")

g2_total = g2_yes = 0
for proj in DP:
    p_base = (f'project = "{proj}" AND issuetype = Story AND "Story Type" = Dev '
              f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
              f'AND status NOT IN (Abandoned)')
    p_yes_jql = p_base + ' AND "Test Case Reviewed" = Yes'
    pt, pk = run(p_base, fetch=50)
    py, _  = run(p_yes_jql)
    try:
        it = int(pt); iy = int(py)
        g2_total += it; g2_yes += iy
        pp = f"{round(iy/it*100,1)}%" if it > 0 else "-"
        ks = ", ".join(pk[:3]) if pk else "-"
        print(f"  {proj:<12}  {it:>7}  {iy:>5}  {pp:>8}  {ks}")
    except:
        print(f"  {proj:<12}  {'ERR':>7}")

g2_pct = round(g2_yes/g2_total*100,1) if g2_total > 0 else 0.0
print(f"  {'GRAND TOTAL':<12}  {g2_total:>7}  {g2_yes:>5}  {str(g2_pct)+'%':>8}")

# ── FINAL COMPARISON ─────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("FINAL COMPARISON  |  Data Platform  |  Target: 220 total, 82 yes (03/13)")
print(SEP)
print(f"  {'Source':<38}  {'03/06 Total':>11}  {'03/06 Yes':>9}  {'03/13 Total':>11}  {'03/13 Yes':>9}")
print(f"  {'-'*38}  {'-'*11}  {'-'*9}  {'-'*11}  {'-'*9}")
print(f"  {'PDF Reference':<38}  {'?':>11}  {'?':>9}  {'220':>11}  {'82':>9}")

for ap in ["A1 (Closed statuses)", "A2 (NOT Abandoned)"]:
    r06 = results.get(f"03/06_{ap}", {})
    r13 = results.get(f"03/13_{ap}", {})
    print(f"  {ap:<38}  {str(r06.get('total','?')):>11}  {str(r06.get('yes','?')):>9}  "
          f"{str(r13.get('total','?')):>11}  {str(r13.get('yes','?')):>9}")

print()
print("DIFF vs PDF (03/13):")
for ap in ["A1 (Closed statuses)", "A2 (NOT Abandoned)"]:
    r13 = results.get(f"03/13_{ap}", {})
    try:
        dt = int(r13['total']) - 220
        dy = int(r13['yes']) - 82
        print(f"  {ap}: total diff={dt:+d}, yes diff={dy:+d}")
    except: pass
print(SEP)
