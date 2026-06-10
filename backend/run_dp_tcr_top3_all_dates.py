# -*- coding: utf-8 -*-
"""
TCR Data Platform — Top 3 Approaches across 3 PDF Snap Dates
PDF References:
  03/13/2026  PI1 CY26  PI_FROM=2026-01-01  Total=220  Yes=82
  04/03/2026  PI1 CY26  PI_FROM=2026-01-01  Total=277  Yes=103
  04/10/2026  PI2 CY26  PI_FROM=2026-04-01  Total=20   Yes=10
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

# 3 PDF snap configurations
SNAPS = [
    {"label": "03/13/2026", "snap": "2026-03-13", "pi_from": "2026-01-01", "pi": "PI1 CY26", "pdf_total": 220, "pdf_yes": 82},
    {"label": "04/03/2026", "snap": "2026-04-03", "pi_from": "2026-01-01", "pi": "PI1 CY26", "pdf_total": 277, "pdf_yes": 103},
    {"label": "04/10/2026", "snap": "2026-04-10", "pi_from": "2026-04-01", "pi": "PI2 CY26", "pdf_total": 20,  "pdf_yes": 10},
]

# Top 3 approaches only
APPROACHES = {
    1: "A1: created + closed + resolved <= snap",
    5: "A5: created + NOT Abandoned + resolved <= snap",
    4: "A4: resolved in PI window + closed",
}

SEP  = "=" * 115
DASH = "-" * 115

def run(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read()).get("total", "ERR")
    except Exception as e:
        return f"ERR:{e}"

def build(snap, pi_from, approach):
    base = f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev'
    if approach == 1:
        return (base +
                f' AND created >= "{pi_from}" AND created <= "{snap} 23:59"'
                f' AND status IN ("Accepted","Test Complete","Done")'
                f' AND resolved <= "{snap} 23:59"')
    elif approach == 5:
        return (base +
                f' AND created >= "{pi_from}" AND created <= "{snap} 23:59"'
                f' AND status NOT IN (Abandoned)'
                f' AND resolved <= "{snap} 23:59"')
    elif approach == 4:
        return (base +
                f' AND status IN ("Accepted","Test Complete","Done")'
                f' AND resolved >= "{pi_from}" AND resolved <= "{snap} 23:59"')

print(SEP)
print("  TEST CASE REVIEW STATUS  |  Data Platform  |  Top 3 Approaches vs 3 PDF Dates")
print(f"  Projects: {len(DP)}  ->  {', '.join(DP)}")
print(SEP)

# ── Collect all results ──────────────────────────────────────────────────────
all_results = {}
total_queries = len(SNAPS) * len(APPROACHES) * 2
done = 0

for snap_cfg in SNAPS:
    label    = snap_cfg["label"]
    snap     = snap_cfg["snap"]
    pi_from  = snap_cfg["pi_from"]
    all_results[label] = {}
    for ap in APPROACHES:
        base_jql = build(snap, pi_from, ap)
        yes_jql  = base_jql + ' AND "Test Case Reviewed" = Yes'
        done += 1; print(f"  [{done}/{total_queries}] {label}  A{ap}  total... ", end="", flush=True)
        total = run(base_jql)
        done += 1; print(f"yes... ", end="", flush=True)
        yes   = run(yes_jql)
        try:
            t = int(total); y = int(yes)
            pct = round(y / t * 100, 1) if t > 0 else 0.0
            td  = t - snap_cfg["pdf_total"]
            yd  = y - snap_cfg["pdf_yes"]
        except:
            t = y = pct = td = yd = "ERR"
        all_results[label][ap] = {"total": t, "yes": y, "pct": pct, "td": td, "yd": yd}
        print(f"Total={t}  Yes={y}")

# ── Per-snap comparison + ranking ────────────────────────────────────────────
for snap_cfg in SNAPS:
    label = snap_cfg["label"]
    pdf_t = snap_cfg["pdf_total"]
    pdf_y = snap_cfg["pdf_yes"]
    pdf_pct = round(pdf_y / pdf_t * 100, 1) if pdf_t else 0.0
    pi    = snap_cfg["pi"]

    print(f"\n{SEP}")
    print(f"  WEEK {label}  |  {pi}  |  PI_FROM={snap_cfg['pi_from']}  |  PDF: Total={pdf_t}  Yes={pdf_y}  ({pdf_pct}%)")
    print(SEP)
    print(f"  {'Approach':<48}  {'Total':>7}  {'Yes':>5}  {'Pct':>7}  {'TotalDiff':>10}  {'YesDiff':>8}")
    print(DASH)
    print(f"  {'PDF Reference':48}  {pdf_t:>7}  {pdf_y:>5}  {pdf_pct:>6}%  {'---':>10}  {'---':>8}")
    print(DASH)

    ranked = []
    for ap in [1, 5, 4]:
        r = all_results[label][ap]
        try:
            td_str = f"{r['td']:>+10}"
            yd_str = f"{r['yd']:>+8}"
            mark   = "  <<<" if abs(r['td']) <= 5 and abs(r['yd']) <= 5 else ""
            ranked.append((ap, r['total'], r['yes'], abs(r['td']), abs(r['yd']), abs(r['td'])+abs(r['yd'])))
        except:
            td_str = yd_str = "   ERR"
            mark   = ""
        print(f"  {APPROACHES[ap]:<48}  {str(r['total']):>7}  {str(r['yes']):>5}  {str(r['pct']):>6}%  {td_str}  {yd_str}{mark}")

    print(DASH)
    print(f"\n  Ranked by |TotalDiff| + |YesDiff| (lower = closer to PDF):")
    print(f"  {'Rank':>5}  {'Approach':<48}  {'Total':>7}  {'Yes':>5}  {'|TDiff|':>8}  {'|YDiff|':>8}  {'Sum':>5}")
    print(DASH)
    for i, (ap, t, y, atd, ayd, s) in enumerate(sorted(ranked, key=lambda x: x[5]), 1):
        mark = "  <-- BEST" if i == 1 else ""
        print(f"  {i:>5}  {APPROACHES[ap]:<48}  {t:>7}  {y:>5}  {atd:>8}  {ayd:>8}  {s:>5}{mark}")

# ── Cross-date summary ───────────────────────────────────────────────────────
print(f"\n{SEP}")
print("  CROSS-DATE SUMMARY  |  Which approach wins each week?")
print(SEP)
print(f"  {'Week':12}  {'PI':10}  {'PDF Total':>10}  {'PDF Yes':>8}  {'Best Approach':50}  {'Sum|Diff|':>10}")
print(DASH)
for snap_cfg in SNAPS:
    label = snap_cfg["label"]
    ranked = []
    for ap in [1, 5, 4]:
        r = all_results[label][ap]
        try:
            ranked.append((ap, abs(r['td'])+abs(r['yd'])))
        except:
            pass
    if ranked:
        best_ap, best_sum = sorted(ranked, key=lambda x: x[1])[0]
        print(f"  {label:<12}  {snap_cfg['pi']:<10}  {snap_cfg['pdf_total']:>10}  {snap_cfg['pdf_yes']:>8}  {APPROACHES[best_ap]:<50}  {best_sum:>10}")

print(SEP)

# ── JQL Reference ────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("  JQL REFERENCE  |  All 3 dates  |  Top 3 Approaches")
print(SEP)
for snap_cfg in SNAPS:
    print(f"\n  --- Week {snap_cfg['label']}  ({snap_cfg['pi']}, PI_FROM={snap_cfg['pi_from']}) ---")
    for ap in [1, 5, 4]:
        base = build(snap_cfg["snap"], snap_cfg["pi_from"], ap)
        print(f"\n  [{snap_cfg['label']}] {APPROACHES[ap]}")
        print(f"    Total: {base}")
        print(f"    Yes:   {base} AND \"Test Case Reviewed\" = Yes")

print(f"\n{SEP}")
