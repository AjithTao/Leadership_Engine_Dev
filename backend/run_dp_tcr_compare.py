# -*- coding: utf-8 -*-
"""
TCR Data Platform - 5 Approach Comparison
PI1 CY26: PI_FROM = 2026-01-01 (per pi_date_utils.py)
PDF targets: week 03/13 -> Total=220, Yes=82 | week 03/06 -> Total=?, Pct=38%
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

# PI1 CY26 dates (from pi_date_utils.py)
PI_FROM  = "2026-01-01"
SNAP_306 = "2026-03-06"
SNAP_313 = "2026-03-13"

# PDF reference
PDF = {
    "313": {"total": 220, "yes": 82},
    "306": {"total": None, "yes": None, "pct": 38.0},
}

def run(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0,
                          "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read()).get("total", "ERR")
    except Exception as e:
        return f"ERR:{e}"

# ── Define 5 approaches ──────────────────────────────────────────────────────
def build(snap, approach):
    base = f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    if approach == 1:
        # BEFORE FIX: created in PI + closed statuses + resolved <= snap
        return (base +
                f'AND created >= "{PI_FROM}" AND created <= "{snap} 23:59" '
                f'AND status IN ("Accepted","Test Complete","Done") '
                f'AND resolved <= "{snap} 23:59"')
    elif approach == 2:
        # AFTER FIX (new code): created in PI + NOT Abandoned (no resolved filter)
        return (base +
                f'AND created >= "{PI_FROM}" AND created <= "{snap} 23:59" '
                f'AND status NOT IN (Abandoned)')
    elif approach == 3:
        # Closed statuses only, no resolved filter
        return (base +
                f'AND created >= "{PI_FROM}" AND created <= "{snap} 23:59" '
                f'AND status IN ("Accepted","Test Complete","Done")')
    elif approach == 4:
        # resolved date IN PI window (no created filter) + closed statuses
        return (base +
                f'AND status IN ("Accepted","Test Complete","Done") '
                f'AND resolved >= "{PI_FROM}" AND resolved <= "{snap} 23:59"')
    elif approach == 5:
        # NOT Abandoned + resolved <= snap (hybrid)
        return (base +
                f'AND created >= "{PI_FROM}" AND created <= "{snap} 23:59" '
                f'AND status NOT IN (Abandoned) '
                f'AND resolved <= "{snap} 23:59"')

APPROACH_LABELS = {
    1: "A1: created+closed+resolved<=snap  [OLD CODE]",
    2: "A2: created+NOT Abandoned          [NEW CODE]",
    3: "A3: created+closed (no resolved)              ",
    4: "A4: resolved in PI window+closed              ",
    5: "A5: created+NOT Abandoned+resolved<=snap      ",
}

SEP  = "=" * 100
DASH = "-" * 100

print(SEP)
print("TEST CASE REVIEW STATUS | Data Platform | PI1 CY26")
print(f"  PI_FROM  : {PI_FROM}  (pi_date_utils.py PI1 CY26 start)")
print(f"  Projects : {len(DP)} — {', '.join(DP)}")
print(SEP)
print(f"  PDF REFERENCE  |  03/06 -> 38%  |  03/13 -> Total=220, Yes=82 (37%)")
print(SEP)

# ── Collect results ──────────────────────────────────────────────────────────
results = {}
for ap in range(1, 6):
    results[ap] = {}
    for snap_key, snap in [("306", SNAP_306), ("313", SNAP_313)]:
        base_jql = build(snap, ap)
        yes_jql  = base_jql + ' AND "Test Case Reviewed" = Yes'
        no_jql   = base_jql + ' AND "Test Case Reviewed" != Yes'
        total = run(base_jql)
        yes   = run(yes_jql)
        no    = run(no_jql)
        try:
            t = int(total); y = int(yes); n = int(no)
            pct = round(y/t*100, 1) if t > 0 else 0.0
        except:
            t = y = n = pct = "ERR"
        results[ap][snap_key] = {"total": t, "yes": y, "no": n, "pct": pct}

# ── Print wide comparison table ──────────────────────────────────────────────
print()
print(f"{'Approach':<50}  {'--- WEEK 03/06 ---':^36}  {'--- WEEK 03/13 ---':^40}")
print(f"{'':50}  {'Total':>7}  {'Yes':>5}  {'No/NS':>6}  {'Pct':>6}  {'Total':>7}  {'Yes':>5}  {'No/NS':>6}  {'Pct':>6}  {'TDiff':>6}  {'YDiff':>6}")
print(DASH)
print(f"  {'PDF Reference':<48}  {'?':>7}  {'?':>5}  {'?':>6}  {'38%':>6}  {'220':>7}  {'82':>5}  {'?':>6}  {'37%':>6}  {'':>6}  {'':>6}")
print(DASH)

for ap in range(1, 6):
    r06 = results[ap]["306"]
    r13 = results[ap]["313"]
    label = APPROACH_LABELS[ap]

    t06 = r06["total"]; y06 = r06["yes"]; n06 = r06["no"]; p06 = r06["pct"]
    t13 = r13["total"]; y13 = r13["yes"]; n13 = r13["no"]; p13 = r13["pct"]

    try:
        td = int(t13) - 220
        yd = int(y13) - 82
        diff_str = f"{td:>+6}  {yd:>+6}"
    except:
        diff_str = "   ERR     ERR"

    print(f"  {label:<48}  {str(t06):>7}  {str(y06):>5}  {str(n06):>6}  {str(p06)+'%':>6}  "
          f"{str(t13):>7}  {str(y13):>5}  {str(n13):>6}  {str(p13)+'%':>6}  {diff_str}")

print(DASH)
print("  TDiff = live Total (03/13) - PDF Total (220)  |  YDiff = live Yes (03/13) - PDF Yes (82)")

# ── Per-approach JQL display ─────────────────────────────────────────────────
print(f"\n{SEP}")
print("JQL DETAILS — Snap = 03/13 (example for each approach)")
print(SEP)
for ap in range(1, 6):
    print(f"\n  {APPROACH_LABELS[ap].strip()}")
    jql = build(SNAP_313, ap)
    print(f"  Total JQL : {jql}")
    print(f"  Yes   JQL : {jql} AND \"Test Case Reviewed\" = Yes")

# ── Closest approach summary ─────────────────────────────────────────────────
print(f"\n{SEP}")
print("CLOSEST TO PDF (Total=220, Yes=82) for 03/13:")
print(f"  {'Approach':<50}  {'Total':>7}  {'Yes':>5}  {'|TDiff|':>8}  {'|YDiff|':>8}  {'Sum|Diff|':>10}")
print(DASH)
ranked = []
for ap in range(1, 6):
    r = results[ap]["313"]
    try:
        td = abs(int(r["total"]) - 220)
        yd = abs(int(r["yes"]) - 82)
        ranked.append((ap, int(r["total"]), int(r["yes"]), td, yd, td+yd))
    except:
        pass

for ap, t, y, td, yd, sd in sorted(ranked, key=lambda x: x[5]):
    print(f"  {APPROACH_LABELS[ap]:<50}  {t:>7}  {y:>5}  {td:>8}  {yd:>8}  {sd:>10}")
print(SEP)
