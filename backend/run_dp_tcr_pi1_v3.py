# -*- coding: utf-8 -*-
"""
Test Case Review Status - Data Platform - PI1 CY26 - v3
Per-project A3 breakdown + project exclusion tests to find Total=220, Yes=82
A3 = created >= PI_FROM AND created <= SNAP AND status IN (...) AND resolved <= SNAP
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
# portfolio_mapping.py version (OEMBD, TDI, TOB, TST instead of MDMCOGS, DPREQ, TDQ)
DP_MAP = [
    "MDSICAP","MDSIA","OIP","MPSMOD","MPSUPDATES","AAP","AIVAPL",
    "AIVA","ASYNCAPI","DNAST","DNASYND","EDPOEMI","MDSEDP","MDSMIG",
    "OEMBD","TDI","TDO","TDOPS","TDP","TOB","TST","UDC","UDI"
]

PI_FROM  = "2026-01-01"
SNAP_306 = "2026-03-06"
SNAP_313 = "2026-03-13"

SEP  = "=" * 80
DASH = "-" * 80

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

def a3_base(proj_filter, snap):
    return (f'{proj_filter} AND issuetype = Story AND "Story Type" = Dev '
            f'AND created >= "{PI_FROM}" AND created <= "{snap} 23:59" '
            f'AND status IN ("Accepted","Test Complete","Done") '
            f'AND resolved <= "{snap} 23:59"')

print(SEP)
print("TCR V3 | Data Platform PI1 | Per-project A3 breakdown | Finding 220/82")
print("A3 = created >= PI_FROM AND created <= SNAP AND closed AND resolved <= SNAP")
print(SEP)
print("PDF TARGET (03/13): Total=220, Yes=82 | (03/06): ~38%")
print(SEP)

# ── Per-project A3 for 03/13 ────────────────────────────────────────────────
print("\nPER-PROJECT A3 BREAKDOWN - Week 03/13:")
print(f"  {'Project':<12}  {'Total':>7}  {'Yes':>5}  {'Pct':>8}")
print(DASH)

pp_total_313 = {}
pp_yes_313   = {}

for proj in DP:
    base = a3_base(f'project = "{proj}"', SNAP_313)
    yes_jql = base + ' AND "Test Case Reviewed" = Yes'
    t, _ = run(base, fetch=50)
    y, _ = run(yes_jql)
    try:
        it = int(t); iy = int(y)
        pp_total_313[proj] = it
        pp_yes_313[proj]   = iy
        pp = f"{round(iy/it*100,1)}%" if it > 0 else "-"
        print(f"  {proj:<12}  {it:>7}  {iy:>5}  {pp:>8}")
    except:
        pp_total_313[proj] = 0
        pp_yes_313[proj]   = 0
        print(f"  {proj:<12}  {'ERR':>7}")

gt = sum(v for v in pp_total_313.values())
gy = sum(v for v in pp_yes_313.values())
print(f"  {'GRAND TOTAL':<12}  {gt:>7}  {gy:>5}  {str(round(gy/gt*100,1))+'%':>8}")

# ── Per-project A3 for 03/06 ────────────────────────────────────────────────
print(f"\nPER-PROJECT A3 BREAKDOWN - Week 03/06:")
print(f"  {'Project':<12}  {'Total':>7}  {'Yes':>5}  {'Pct':>8}")
print(DASH)

pp_total_306 = {}
pp_yes_306   = {}

for proj in DP:
    base = a3_base(f'project = "{proj}"', SNAP_306)
    yes_jql = base + ' AND "Test Case Reviewed" = Yes'
    t, _ = run(base, fetch=50)
    y, _ = run(yes_jql)
    try:
        it = int(t); iy = int(y)
        pp_total_306[proj] = it
        pp_yes_306[proj]   = iy
        pp = f"{round(iy/it*100,1)}%" if it > 0 else "-"
        print(f"  {proj:<12}  {it:>7}  {iy:>5}  {pp:>8}")
    except:
        pp_total_306[proj] = 0
        pp_yes_306[proj]   = 0
        print(f"  {proj:<12}  {'ERR':>7}")

gt6 = sum(v for v in pp_total_306.values())
gy6 = sum(v for v in pp_yes_306.values())
print(f"  {'GRAND TOTAL':<12}  {gt6:>7}  {gy6:>5}  {str(round(gy6/gt6*100,1))+'%':>8}")

# ── Try excluding projects to reach 220 ────────────────────────────────────
print(f"\n{SEP}")
print("EXCLUSION TESTS (03/13 A3 grand={gt}, need 220):")
print("Testing which project subsets get closest to Total=220, Yes=82")
print(SEP)

# Sort by total descending
sorted_projs = sorted(pp_total_313.items(), key=lambda x: x[1], reverse=True)
print("Projects ranked by A3 contribution (03/13):")
cumulative = 0
for p, c in sorted_projs:
    if c > 0:
        cumulative += c
        print(f"  {p:<12}: {c:>4} stories  (cumulative: {cumulative})")

# Try portfolio_mapping.py list vs user list for A3
print(f"\n{DASH}")
print("Testing portfolio_mapping.py project list for A3 03/13:")
PROJECTS_MAP = ",".join(f'"{p}"' for p in DP_MAP)
base_map = (f'project IN ({PROJECTS_MAP}) AND issuetype = Story AND "Story Type" = Dev '
            f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
            f'AND status IN ("Accepted","Test Complete","Done") '
            f'AND resolved <= "{SNAP_313} 23:59"')
yes_map = base_map + ' AND "Test Case Reviewed" = Yes'
tm, _ = run(base_map)
ym, _ = run(yes_map)
print(f"  portfolio_mapping.py list A3: Total={tm}, Yes={ym}")

# Try excluding projects with 0 yes (assume PDF might filter low-activity projects)
active = [p for p, c in pp_total_313.items() if c > 0]
active_str = ",".join(f'"{p}"' for p in active)
base_active = (f'project IN ({active_str}) AND issuetype = Story AND "Story Type" = Dev '
               f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
               f'AND status IN ("Accepted","Test Complete","Done") '
               f'AND resolved <= "{SNAP_313} 23:59"')
yes_active = base_active + ' AND "Test Case Reviewed" = Yes'
ta, _ = run(base_active)
ya, _ = run(yes_active)
print(f"  Active-only projects ({len(active)}) A3: Total={ta}, Yes={ya}")

# Try core Data Platform (TDP, UDC, UDI, TDOPS, EDPOEMI, AIVA) only
core = ["TDP","UDC","UDI","TDOPS","EDPOEMI","AIVA"]
core_str = ",".join(f'"{p}"' for p in core)
base_core = (f'project IN ({core_str}) AND issuetype = Story AND "Story Type" = Dev '
             f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
             f'AND status IN ("Accepted","Test Complete","Done") '
             f'AND resolved <= "{SNAP_313} 23:59"')
yes_core = base_core + ' AND "Test Case Reviewed" = Yes'
tc, _ = run(base_core)
yc, _ = run(yes_core)
print(f"  Core 6 projects (TDP+UDC+UDI+TDOPS+EDPOEMI+AIVA) A3: Total={tc}, Yes={yc}")

# Try core + MDSMIG
ext = ["TDP","UDC","UDI","TDOPS","EDPOEMI","AIVA","MDSMIG"]
ext_str = ",".join(f'"{p}"' for p in ext)
base_ext = (f'project IN ({ext_str}) AND issuetype = Story AND "Story Type" = Dev '
            f'AND created >= "{PI_FROM}" AND created <= "{SNAP_313} 23:59" '
            f'AND status IN ("Accepted","Test Complete","Done") '
            f'AND resolved <= "{SNAP_313} 23:59"')
yes_ext = base_ext + ' AND "Test Case Reviewed" = Yes'
te, _ = run(base_ext)
ye, _ = run(yes_ext)
print(f"  7 projects (+MDSMIG) A3: Total={te}, Yes={ye}")

print(f"\n{SEP}")
print("SUMMARY - A3 contributions by project (03/13):")
print(f"  PDF Target: Total=220, Yes=82")
print(f"  Full 22-project A3: Total={gt}, Yes={gy}")
print(f"  Full 22-project A3 (03/06): Total={gt6}, Yes={gy6}")
print(SEP)
