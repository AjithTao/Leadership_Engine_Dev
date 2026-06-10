# -*- coding: utf-8 -*-
"""
Test Case Review Status - Data Platform
Two approaches vs PDF reference value:
  PDF (04/10): Total=20, Reviewed Yes=10, Coverage=50%

Approach 1 (Current code way):
  status IN ("Accepted","Test Complete","Done") - no resolved filter

Approach 2 (Ignore Abandoned only):
  status NOT IN (Abandoned) - open to any other status
"""
import os
import urllib.request, json, sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json", "Content-Type": "application/json"}

# Data Platform projects (user-provided)
DP_PROJECTS_LIST = [
    "MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
    "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
    "TDO","TDOPS","TDP","TDQ","UDC","UDI"
]
PROJECTS = ",".join(f'"{p}"' for p in DP_PROJECTS_LIST)

PI_FROM  = "2026-04-01"
SNAP     = "2026-04-10"

# PDF reference
PDF_TOTAL = 20
PDF_YES   = 10
PDF_PCT   = 50.0

def run(label, jql, fetch=100):
    payload = json.dumps({
        "jql": jql, "maxResults": fetch,
        "fields": ["summary","status","key"]
    }).encode()
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

SEP  = "=" * 78
DASH = "-" * 78

print(SEP)
print("TEST CASE REVIEW STATUS  |  Data Platform  |  Week ending 04/10/2026")
print(f"Projects ({len(DP_PROJECTS_LIST)}): {', '.join(DP_PROJECTS_LIST)}")
print(f"PI2 CY26 window: {PI_FROM} to {SNAP}")
print(SEP)
print(f"PDF REFERENCE  ->  Total Stories: {PDF_TOTAL}  |  Reviewed Yes: {PDF_YES}  |  Coverage: {PDF_PCT}%")
print(SEP)

# ─────────────────────────────────────────────────────────────
# APPROACH 1: Current code way (closed statuses only, no resolved)
# ─────────────────────────────────────────────────────────────
print("\nAPPROACH 1 - CURRENT CODE WAY")
print("  Logic: status IN (Accepted, Test Complete, Done)")
print("  Date:  created >= PI_FROM AND created <= SNAP (NO resolved filter)")
print(DASH)

A1_BASE = (
    f'project IN ({PROJECTS}) '
    f'AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
    f'AND status IN ("Accepted", "Test Complete", "Done")'
)
A1_YES = A1_BASE + ' AND "Test Case Reviewed" = Yes'
A1_NO  = A1_BASE + ' AND "Test Case Reviewed" != Yes'

a1_total, a1_keys = run("A1 Total", A1_BASE, fetch=100)
a1_yes,   _       = run("A1 Yes",   A1_YES)
a1_no,    _       = run("A1 No",    A1_NO)

try:
    a1_pct = round(int(a1_yes) / int(a1_total) * 100, 1) if int(a1_total) > 0 else 0.0
except:
    a1_pct = "N/A"

print(f"  Total Closed Dev Stories  : {a1_total}")
print(f"  Test Case Reviewed = Yes  : {a1_yes}")
print(f"  Test Case Reviewed != Yes : {a1_no}")
print(f"  Coverage %%                : {a1_pct}%")
if a1_keys:
    print(f"  Story Keys (first 30)     : {', '.join(a1_keys[:30])}")
print(f"\n  JQL (Total):")
print(f"    {A1_BASE}")
print(f"\n  JQL (Reviewed Yes):")
print(f"    {A1_YES}")

# ─────────────────────────────────────────────────────────────
# APPROACH 2: Ignore Abandoned only (all other statuses count)
# ─────────────────────────────────────────────────────────────
print()
print("APPROACH 2 - IGNORE ABANDONED ONLY")
print("  Logic: status NOT IN (Abandoned)  -- all other statuses count")
print("  Date:  created >= PI_FROM AND created <= SNAP")
print(DASH)

A2_BASE = (
    f'project IN ({PROJECTS}) '
    f'AND issuetype = Story AND "Story Type" = Dev '
    f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
    f'AND status NOT IN (Abandoned)'
)
A2_YES = A2_BASE + ' AND "Test Case Reviewed" = Yes'
A2_NO  = A2_BASE + ' AND "Test Case Reviewed" != Yes'

a2_total, a2_keys = run("A2 Total", A2_BASE, fetch=100)
a2_yes,   _       = run("A2 Yes",   A2_YES)
a2_no,    _       = run("A2 No",    A2_NO)

try:
    a2_pct = round(int(a2_yes) / int(a2_total) * 100, 1) if int(a2_total) > 0 else 0.0
except:
    a2_pct = "N/A"

print(f"  Total Dev Stories (excl Abandoned)  : {a2_total}")
print(f"  Test Case Reviewed = Yes            : {a2_yes}")
print(f"  Test Case Reviewed != Yes           : {a2_no}")
print(f"  Coverage %%                          : {a2_pct}%")
if a2_keys:
    print(f"  Story Keys (first 30)               : {', '.join(a2_keys[:30])}")
print(f"\n  JQL (Total):")
print(f"    {A2_BASE}")
print(f"\n  JQL (Reviewed Yes):")
print(f"    {A2_YES}")

# ─────────────────────────────────────────────────────────────
# BONUS: Per-project breakdown for Approach 1 (helps understand distribution)
# ─────────────────────────────────────────────────────────────
print()
print("PER-PROJECT BREAKDOWN (Approach 1 — closed statuses)")
print(DASH)
print(f"  {'Project':<12}  {'Total':>7}  {'Yes':>5}  {'Coverage':>10}  Keys")

grand_total = 0
grand_yes   = 0

for proj in DP_PROJECTS_LIST:
    p_base = (
        f'project = "{proj}" '
        f'AND issuetype = Story AND "Story Type" = Dev '
        f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
        f'AND status IN ("Accepted", "Test Complete", "Done")'
    )
    p_yes_jql = p_base + ' AND "Test Case Reviewed" = Yes'

    p_total, p_keys = run(f"{proj} total", p_base, fetch=50)
    p_yes,   _      = run(f"{proj} yes",   p_yes_jql)

    try:
        pt = int(p_total)
        py = int(p_yes)
        grand_total += pt
        grand_yes   += py
        p_pct = f"{round(py/pt*100,1)}%" if pt > 0 else "-"
        key_str = ", ".join(p_keys[:5]) if p_keys else "-"
        print(f"  {proj:<12}  {pt:>7}  {py:>5}  {p_pct:>10}  {key_str}")
    except:
        print(f"  {proj:<12}  {str(p_total):>7}  {'?':>5}  {'ERR':>10}")

grand_pct = round(grand_yes / grand_total * 100, 1) if grand_total > 0 else 0.0
print(f"  {'GRAND TOTAL':<12}  {grand_total:>7}  {grand_yes:>5}  {str(grand_pct)+'%':>10}")

# ─────────────────────────────────────────────────────────────
# FINAL SIDE-BY-SIDE
# ─────────────────────────────────────────────────────────────
print()
print(SEP)
print("FINAL COMPARISON  |  Week ending 04/10/2026  |  Data Platform")
print(SEP)
print(f"  {'Source':<40}  {'Total':>7}  {'Yes':>5}  {'Coverage':>10}")
print(f"  {'-'*40}  {'-'*7}  {'-'*5}  {'-'*10}")
print(f"  {'PDF Reference':<40}  {PDF_TOTAL:>7}  {PDF_YES:>5}  {str(PDF_PCT)+'%':>10}")
try:
    print(f"  {'Approach 1 (closed statuses)':<40}  {int(a1_total):>7}  {int(a1_yes):>5}  {str(a1_pct)+'%':>10}")
except: pass
try:
    print(f"  {'Approach 2 (excl Abandoned only)':<40}  {int(a2_total):>7}  {int(a2_yes):>5}  {str(a2_pct)+'%':>10}")
except: pass

print()
print("GAP ANALYSIS:")
try:
    print(f"  Approach 1 total vs PDF  :  {int(a1_total):+d} vs {PDF_TOTAL}  -> diff {int(a1_total)-PDF_TOTAL:+d}")
    print(f"  Approach 1 yes vs PDF    :  {int(a1_yes):+d} vs {PDF_YES}  -> diff {int(a1_yes)-PDF_YES:+d}")
    print(f"  Approach 2 total vs PDF  :  {int(a2_total):+d} vs {PDF_TOTAL}  -> diff {int(a2_total)-PDF_TOTAL:+d}")
    print(f"  Approach 2 yes vs PDF    :  {int(a2_yes):+d} vs {PDF_YES}  -> diff {int(a2_yes)-PDF_YES:+d}")
except: pass
print(SEP)
