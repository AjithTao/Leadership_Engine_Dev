# -*- coding: utf-8 -*-
"""
M3 — Try subtasksOf() for DMS to capture test cases as sub-tasks of stories
Also test combined: "is tested by" OR subtasksOf
SNAP=2026-04-10  PI_FROM=2026-04-01
PDF 04/10: DP=48/40  DS=43/21  DMS=145/37
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
        "projects": ["MDSICAP","MDSIA","OIP","MPSUPDATES","MPSMOD","AAP","AIVAPL","MDMCOGS",
                     "AIVA","ASYNCAPI","DNASYND","DPREQ","DNAST","EDPOEMI","MDSMIG","MDSEDP",
                     "TDO","TDOPS","TDP","TDQ","UDC","UDI"],
        "pdf_tests": 48, "pdf_stories": 40,
    },
    "Data Solutions": {
        "projects": ["NDP","NPS","DNADEDGE","APITRON","DET","WRAAP","WRP"],
        "pdf_tests": 43, "pdf_stories": 21,
    },
    "DMS": {
        "projects": ["ARMODACC","AIMODACC","APMODACC","FSMODACC","GLMODACC","POMODACC",
                     "MODACCRPTS","MODSET","YEMODACC","MODBETC","MODSRCH","MODDWTC","MDWP",
                     "MODPLAT","MODTOOL","BRMODACC","ACC","FSACC","DRV","MGDIT","PKM",
                     "SODRV","TRKMOD","TRKMISC","MODOEM","OEMI","PSRD"],
        "pdf_tests": 145, "pdf_stories": 37,
    },
}

SEP  = "=" * 115
DASH = "-" * 115

def run_jql(jql):
    payload = json.dumps({"jql": jql, "maxResults": 0, "fields": ["key"]}).encode()
    req = urllib.request.Request(f"{JIRA_URL}/rest/api/2/search",
                                 data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()).get("total", "ERR"), None
    except urllib.request.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8", errors="replace"))
            msgs = body.get("errorMessages", []) + list(body.get("errors", {}).values())
            return "ERR", " | ".join(str(x) for x in msgs)[:150]
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
            return f"ERR:{err[:80]}", valid, removed
    return "ERR", [], removed

def prj(projects):
    return f'project IN ({",".join(chr(34)+p+chr(34) for p in projects)})'

# A4 stories — resolved in PI window + closed
def stories_A4(projects):
    return (f'{prj(projects)} AND issuetype = Story AND "Story Type" = Dev'
            f' AND status IN ("Accepted","Test Complete","Done")'
            f' AND resolved >= "{PI_FROM}" AND resolved <= "{SNAP} 23:59"')

# Inner story JQL for ScriptRunner functions (single-quoted dates)
INNER = (f'issuetype = Story AND \\"Story Type\\" = Dev'
         f' AND status IN (\\"Accepted\\",\\"Test Complete\\",\\"Done\\")'
         f' AND resolved >= \'{PI_FROM}\' AND resolved <= \'{SNAP} 23:59\'')

# 1. "is tested by" only (current best)
def tests_itb(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in linkedIssuesOf("{INNER}", "is tested by")')

# 2. subtasksOf only
def tests_subtasks(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND issueFunction in subtasksOf("{INNER}")')

# 3. "is tested by" OR subtasksOf
def tests_itb_or_subtasks(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND (issueFunction in linkedIssuesOf("{INNER}", "is tested by")'
            f' OR issueFunction in subtasksOf("{INNER}"))')

# 4. All linked (no link type) OR subtasksOf
def tests_alllinks_or_subtasks(projects):
    return (f'{prj(projects)} AND issuetype = Test AND status NOT IN (Abandoned)'
            f' AND (issueFunction in linkedIssuesOf("{INNER}")'
            f' OR issueFunction in subtasksOf("{INNER}"))')

VARIANTS = [
    ("is tested by  [current best]",    tests_itb),
    ("subtasksOf only",                 tests_subtasks),
    ("is tested by OR subtasksOf",      tests_itb_or_subtasks),
    ("all links    OR subtasksOf",      tests_alllinks_or_subtasks),
]

print(SEP)
print(f"  M3 — subtasksOf() Test  |  A4 Stories  |  SNAP={SNAP}")
print(f"  PDF 04/10: DP=48/40   DS=43/21   DMS=145/37")
print(SEP)

all_results = {}
for portfolio, cfg in PORTFOLIOS.items():
    projects = cfg["projects"]
    print(f"\n  [{portfolio}]  PDF: Tests={cfg['pdf_tests']}  Stories={cfg['pdf_stories']}")

    s, valid, rem = run_safe(stories_A4, projects)
    if rem: print(f"    [skip invalid]: {', '.join(rem)}")
    print(f"    Stories (A4): {s}  (PDF={cfg['pdf_stories']}  diff={int(s)-cfg['pdf_stories']:+d})")

    all_results[portfolio] = {"s": s, "pdf_s": cfg["pdf_stories"], "pdf_t": cfg["pdf_tests"], "variants": {}}
    for label, t_fn in VARIANTS:
        t, _, _ = run_safe(t_fn, valid)
        try:
            ratio = round(int(t)/int(s), 2) if int(s) > 0 else 0.0
            diff  = f"{int(t)-cfg['pdf_tests']:+d}"
            mark  = " <-- BEST" if abs(int(t)-cfg['pdf_tests']) <= 5 else ""
        except:
            ratio = "ERR"; diff = "ERR"; mark = ""
        all_results[portfolio]["variants"][label] = {"t": t, "ratio": ratio, "diff": diff}
        print(f"    {label:<40}  Tests={str(t):<8}  Ratio={str(ratio):<6}  Diff={diff}{mark}")

# ── Summary table ─────────────────────────────────────────────────────────────
print(f"\n\n{SEP}")
print(f"  SUMMARY  |  All Approaches  |  SNAP={SNAP}")
print(SEP)
print(f"  {'Approach':<40}  {'DP Tests':>10}  {'DS Tests':>10}  {'DMS Tests':>11}")
print(f"  {'':40}  {'PDF=48':>10}  {'PDF=43':>10}  {'PDF=145':>11}")
print(DASH)
for label, _ in VARIANTS:
    row = f"  {label:<40}"
    for portfolio in PORTFOLIOS:
        r = all_results[portfolio]["variants"][label]
        try:
            row += f"  {str(r['t']):>7}({r['diff']:>+3})"
        except:
            row += f"  {'ERR':>12}"
    print(row)
print(DASH)

# ── Best approach JQL ─────────────────────────────────────────────────────────
print(f"\n{SEP}")
print(f"  JQL REFERENCE  |  is tested by OR subtasksOf  |  SNAP={SNAP}")
print(SEP)
dp = PORTFOLIOS["Data Platform"]["projects"]
print(f"\n  STORIES (A4):")
print(f"    {stories_A4(dp)}")
print(f"\n  TESTS (is tested by OR subtasksOf):")
print(f"    {tests_itb_or_subtasks(dp)}")
print(f"\n{SEP}")
