# -*- coding: utf-8 -*-
"""
TCR Data Platform - 5 Approach Comparison
PI2 CY26: PI_FROM = 2026-04-01 (per pi_date_utils.py)
PDF target: week ending 04/10 -> Coverage = 50%
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

# PI2 CY26 dates (from pi_date_utils.py)
PI_FROM = "2026-04-01"
SNAP    = "2026-04-10"

# PDF reference
PDF_TOTAL = 20    # from 04/10 PDF for Data Platform
PDF_YES   = 10    # 50% of 20
PDF_PCT   = 50.0

def run(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read()).get("total", "ERR")
    except Exception as e:
        return f"ERR:{e}"

def build(approach):
    base = f'project IN ({PROJECTS}) AND issuetype = Story AND "Story Type" = Dev '
    if approach == 1:
        return (base +
                f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
                f'AND status IN ("Accepted","Test Complete","Done") '
                f'AND resolved <= "{SNAP} 23:59"')
    elif approach == 2:
        return (base +
                f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
                f'AND status NOT IN (Abandoned)')
    elif approach == 3:
        return (base +
                f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
                f'AND status IN ("Accepted","Test Complete","Done")')
    elif approach == 4:
        return (base +
                f'AND status IN ("Accepted","Test Complete","Done") '
                f'AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"')
    elif approach == 5:
        return (base +
                f'AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59" '
                f'AND status NOT IN (Abandoned) '
                f'AND resolved <= "{SNAP} 23:59"')

LABELS = {
    1: "A1: created + closed + resolved <= snap   [OLD CODE]",
    2: "A2: created + NOT Abandoned               [NEW CODE]",
    3: "A3: created + closed  (no resolved)                 ",
    4: "A4: resolved in PI window + closed                  ",
    5: "A5: created + NOT Abandoned + resolved <= snap      ",
}

SEP  = "=" * 110
DASH = "-" * 110
THIN = "-" * 110

# ── Header ────────────────────────────────────────────────────────────────────
print(SEP)
print("  TEST CASE REVIEW STATUS  |  Data Platform  |  PI2 CY26  |  Week ending 04/10/2026")
print(f"  PI_FROM : {PI_FROM}  (pi_date_utils.py PI2 CY26 start)")
print(f"  SNAP    : {SNAP}")
print(f"  Projects: {len(DP)}  ->  {', '.join(DP)}")
print(SEP)
print(f"  PDF REFERENCE  ->  Total = {PDF_TOTAL}  |  Yes = {PDF_YES}  |  Coverage = {PDF_PCT}%")
print(SEP)

# ── Collect results ────────────────────────────────────────────────────────────
print("\n  Querying Jira for all 5 approaches ...\n")
results = {}
for ap in range(1, 6):
    base_jql = build(ap)
    yes_jql  = base_jql + ' AND "Test Case Reviewed" = Yes'
    no_jql   = base_jql + ' AND "Test Case Reviewed" != Yes'
    total = run(base_jql)
    yes   = run(yes_jql)
    no    = run(no_jql)
    try:
        t = int(total); y = int(yes); n = int(no)
        pct = round(y / t * 100, 1) if t > 0 else 0.0
        td = t - PDF_TOTAL
        yd = y - PDF_YES
    except:
        t = y = n = pct = td = yd = "ERR"
    results[ap] = {"total": t, "yes": y, "no": n, "pct": pct, "td": td, "yd": yd}
    print(f"  [{ap}/5] {LABELS[ap].strip():<50}  done  ->  Total={t}  Yes={y}")

# ── Main comparison table ──────────────────────────────────────────────────────
print(f"\n{SEP}")
print("  COMPARISON TABLE  |  Week 04/10  |  5 Approaches vs PDF")
print(SEP)
print(f"  {'':3}  {'Approach':<52}  {'Total':>7}  {'Yes':>5}  {'No/NS':>6}  {'Coverage%':>10}  {'TotalDiff':>10}  {'YesDiff':>8}")
print(DASH)
print(f"  {'':3}  {'PDF Reference (04/10/2026)':<52}  {str(PDF_TOTAL):>7}  {str(PDF_YES):>5}  {'?':>6}  {str(PDF_PCT)+'%':>10}  {'---':>10}  {'---':>8}")
print(DASH)

for ap in range(1, 6):
    r = results[ap]
    try:
        td_str = f"{r['td']:>+10}"
        yd_str = f"{r['yd']:>+8}"
        match  = "  <<<" if abs(r['td']) <= 2 and abs(r['yd']) <= 2 else ""
    except:
        td_str = yd_str = "   ERR"
        match  = ""
    print(f"  [{ap}]  {LABELS[ap]:<52}  {str(r['total']):>7}  {str(r['yes']):>5}  "
          f"{str(r['no']):>6}  {str(r['pct'])+'%':>10}  {td_str}  {yd_str}{match}")

print(DASH)
print(f"  TotalDiff = live Total - PDF Total ({PDF_TOTAL})  |  YesDiff = live Yes - PDF Yes ({PDF_YES})")
print(f"  Positive diff = live is HIGHER than PDF  |  Negative diff = live is LOWER than PDF")

# ── Closest to PDF (ranked by sum of absolute diffs) ──────────────────────────
print(f"\n{SEP}")
print("  RANKED BY CLOSENESS TO PDF COUNTS  (Total=20, Yes=10)")
print(f"  Rank is by |TotalDiff| + |YesDiff|  (lower = closer)")
print(SEP)
print(f"  {'Rank':>5}  {'Approach':<52}  {'Total':>7}  {'Yes':>5}  {'|TotalDiff|':>12}  {'|YesDiff|':>10}  {'Sum':>6}")
print(DASH)

ranked = []
for ap in range(1, 6):
    r = results[ap]
    try:
        ranked.append((ap, r['total'], r['yes'], abs(r['td']), abs(r['yd']), abs(r['td'])+abs(r['yd'])))
    except:
        pass

for i, (ap, t, y, atd, ayd, s) in enumerate(sorted(ranked, key=lambda x: x[5]), 1):
    match = "  <-- CLOSEST" if i == 1 else ""
    print(f"  {i:>5}  {LABELS[ap]:<52}  {t:>7}  {y:>5}  {atd:>12}  {ayd:>10}  {s:>6}{match}")

# ── JQL Reference ──────────────────────────────────────────────────────────────
print(f"\n{SEP}")
print("  JQL REFERENCE  |  Week 04/10  |  PI_FROM = 2026-04-01  |  SNAP = 2026-04-10")
print(SEP)
for ap in range(1, 6):
    base = build(ap)
    yes  = base + ' AND "Test Case Reviewed" = Yes'
    print(f"\n  [{ap}] {LABELS[ap].strip()}")
    print(f"  Total JQL:")
    print(f"    {base}")
    print(f"  Yes JQL:")
    print(f"    {yes}")

print(f"\n{SEP}")
