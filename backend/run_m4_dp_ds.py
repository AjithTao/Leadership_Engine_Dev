# -*- coding: utf-8 -*-
"""
M4 Bug Discovery Ratio — Data Platform + Data Solutions, all approaches
PDF 04/10: DP Tests=208 Bugs=3 Ratio=1.44%  |  DS Tests=90 Bugs=9 Ratio=10.00%
SNAP=2026-04-10  PI_FROM=2026-04-01
"""
import os
import urllib.request, json, sys, re
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JIRA_URL = "https://projects.cdk.com"
TOKEN    = os.environ["JIRA_API_TOKEN"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json", "Content-Type": "application/json"}

PI_FROM = "2026-04-01"
SNAP    = "2026-04-10"

PORTFOLIOS = {
    "Data Platform": {
        "projects": ["MDSICAP","MDSIA","OIP","MPSMOD","MPSUPDATES","AAP","AIVAPL","AIVA",
                     "ASYNCAPI","DNAST","DNASYND","EDPOEMI","MDSEDP","MDSMIG","OEMBD","TDI",
                     "TDO","TDOPS","TDP","TOB","TST","UDC","UDI"],
        "pdf_tests": 208, "pdf_bugs": 3,
    },
    "Data Solutions": {
        "projects": ["NDP","SSBYOD","DNACS","NPS","DNADEDGE","DNADDX","APITRON","DET","WRP"],
        "pdf_tests": 90, "pdf_bugs": 9,
    },
}

SEP  = "=" * 115
DASH = "-" * 115

def run_jql(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read()).get("total", "ERR"), None
    except urllib.request.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8", errors="replace"))
            msgs = body.get("errorMessages", []) + list(body.get("errors", {}).values())
            return "ERR", " | ".join(str(x) for x in msgs)[:120]
        except:
            return "ERR", str(e)
    except Exception as e:
        return "ERR", str(e)

def bad_project(err):
    m = re.search(r"'([A-Z0-9]+)' does not exist for the field 'project'", err or "")
    return m.group(1) if m else None

def run_safe(jql_fn, projects):
    valid = list(projects); removed = []
    while valid:
        t, err = run_jql(jql_fn(valid))
        if err is None: return t, valid, removed
        bp = bad_project(err)
        if bp and bp in valid:
            valid.remove(bp); removed.append(bp)
        else:
            return "ERR", valid, removed
    return "ERR", [], removed

def prj(p):
    return f'project IN ({",".join(chr(34)+x+chr(34) for x in p)})'

# ── Bug approaches ────────────────────────────────────────────────────────────
BUG_APPROACHES = [
    ("B1: issuetype=Bug, created in PI",
     lambda p: f'{prj(p)} AND issuetype = Bug AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'),
    ("B2: issuetype IN (Bug,Defect), created in PI",
     lambda p: f'{prj(p)} AND issuetype IN (Bug, Defect) AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'),
    ("B3: Bug created in PI, status NOT IN (Abandoned)",
     lambda p: f'{prj(p)} AND issuetype = Bug AND status NOT IN (Abandoned) AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'),
]

# ── Test Case approaches ──────────────────────────────────────────────────────
TEST_APPROACHES = [
    ("T1: Tests created in PI",
     lambda p: (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
                f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"')),

    ("T2: Tests linked Story/Bug/Defect created in PI",
     lambda p: (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
                f' AND issueFunction in linkedIssuesOf("issuetype IN (Story, Bug, Defect)'
                f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'")')),

    ("T3: Tests linked Dev-Story/Bug/Defect created in PI",
     lambda p: (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
                f' AND issueFunction in linkedIssuesOf("(issuetype = Story AND \\"Story Type\\" = Dev'
                f' OR issuetype IN (Bug, Defect))'
                f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'")')),

    ("T4: Tests is-tested-by closed Dev stories (M3)",
     lambda p: (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
                f' AND issueFunction in linkedIssuesOf("issuetype = Story AND \\"Story Type\\" = Dev'
                f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
                f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'", "is tested by")')),

    ("T5: Tests created in PI OR linked to Story/Bug/Defect in PI",
     lambda p: (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
                f' AND (created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
                f' OR issueFunction in linkedIssuesOf("issuetype IN (Story, Bug, Defect)'
                f' AND created >= \'{PI_FROM}\' AND created <= \'{SNAP} 23:59\'"))')),

    ("T6: Tests created in PI + linked to any work item",
     lambda p: (f'{prj(p)} AND issuetype = Test AND status NOT IN (Abandoned)'
                f' AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"'
                f' AND issueFunction in linkedIssuesOf("issuetype IN (Story, Bug, Defect)")')),
]

print(SEP)
print(f"  M4 Bug Discovery Ratio  |  DP + DS  |  SNAP={SNAP}")
print(f"  PDF: DP Tests=208 Bugs=3 Ratio=1.44%  |  DS Tests=90 Bugs=9 Ratio=10.00%")
print(SEP)

all_results = {}
for portfolio, cfg in PORTFOLIOS.items():
    projects   = cfg["projects"]
    pdf_t      = cfg["pdf_tests"]
    pdf_b      = cfg["pdf_bugs"]
    pdf_ratio  = round(pdf_b / pdf_t * 100, 2)

    print(f"\n{'='*60}")
    print(f"  [{portfolio}]  PDF: Tests={pdf_t}  Bugs={pdf_b}  Ratio={pdf_ratio}%")
    print(f"{'='*60}")

    # Validate projects once
    _, valid, rem = run_safe(lambda p: f'{prj(p)} AND issuetype = Bug AND created >= "{PI_FROM}" AND created <= "{SNAP} 23:59"', projects)
    if rem:
        print(f"  [removed invalid]: {', '.join(rem)}")

    print(f"\n  BUGS:")
    bug_vals = {}
    for label, fn in BUG_APPROACHES:
        b, _, _ = run_safe(fn, valid)
        bug_vals[label] = b
        try:
            diff = f"{int(b)-pdf_b:+d}"
            mark = "  <--" if abs(int(b)-pdf_b) <= 1 else ""
        except:
            diff = "ERR"; mark = ""
        print(f"    {label:<50}  Bugs={str(b):<6}  Diff={diff}{mark}")

    print(f"\n  TESTS:")
    test_vals = {}
    for label, fn in TEST_APPROACHES:
        t, _, _ = run_safe(fn, valid)
        test_vals[label] = t
        try:
            diff = f"{int(t)-pdf_t:+d}"
            mark = "  <--" if abs(int(t)-pdf_t) <= 5 else ""
        except:
            diff = "ERR"; mark = ""
        print(f"    {label:<50}  Tests={str(t):<6}  Diff={diff}{mark}")

    all_results[portfolio] = {
        "bugs": bug_vals, "tests": test_vals,
        "pdf_t": pdf_t, "pdf_b": pdf_b, "pdf_ratio": pdf_ratio
    }

# ── Ratio table ───────────────────────────────────────────────────────────────
print(f"\n\n{SEP}")
print(f"  RATIO TABLE  |  B1 Bugs x All Test Approaches  |  SNAP={SNAP}")
print(f"  (Ratio = B1_bugs / Tests * 100%)  Target: match PDF ratio")
print(SEP)

for portfolio, r in all_results.items():
    b1 = r["bugs"].get("B1: issuetype=Bug, created in PI", "ERR")
    pdf_ratio = r["pdf_ratio"]
    print(f"\n  [{portfolio}]  B1_Bugs={b1}  PDF_Ratio={pdf_ratio}%")
    print(f"  {'Test Approach':<50}  {'Tests':>7}  {'Ratio%':>8}  {'RatioDiff':>10}")
    print(f"  {'-'*80}")
    for tlabel, _ in TEST_APPROACHES:
        t = r["tests"].get(tlabel, "ERR")
        try:
            ratio_pct = round(int(b1) / int(t) * 100, 2)
            rdiff = round(ratio_pct - pdf_ratio, 2)
            mark = "  <-- BEST" if abs(rdiff) <= 0.3 else ("  <-- CLOSE" if abs(rdiff) <= 1.0 else "")
        except:
            ratio_pct = rdiff = "ERR"; mark = ""
        print(f"  {tlabel:<50}  {str(t):>7}  {str(ratio_pct):>8}  {str(rdiff):>10}{mark}")

print(f"\n{SEP}")
